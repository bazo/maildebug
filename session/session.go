package session

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"maildebug/types"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"
	"time"

	crand "crypto/rand"

	"github.com/emersion/go-smtp"
)

type dataCallback func(*types.MailData, []byte) error

// The Backend implements SMTP server methods.
type Backend struct {
	username string
	password string
	onData   dataCallback
}

func NewBackend(username string, password string, onData dataCallback) *Backend {
	return &Backend{
		username,
		password,
		onData,
	}
}

func (b *Backend) NewSession(_ *smtp.Conn) (smtp.Session, error) {
	return &session{
		username: b.username,
		password: b.password,
		onData:   b.onData,
		data:     &types.MailData{},
	}, nil
}

// A session is returned after EHLO.
type session struct {
	username string
	password string
	onData   dataCallback
	data     *types.MailData
}

func (s *session) AuthPlain(username, password string) error {
	if username != s.username || password != s.password {
		return errors.New("invalid username or password")
	}
	return nil
}

func (s *session) Mail(from string, opts *smtp.MailOptions) error {
	s.data.From = from
	return nil
}

func (s *session) Rcpt(to string, options *smtp.RcptOptions) error {
	s.data.To = append(s.data.To, to)
	return nil
}

func (s *session) Data(r io.Reader) error {
	raw, err := io.ReadAll(r)
	if err != nil {
		return err
	}

	s.data.Id = generateID()

	m, parseErr := mail.ReadMessage(bytes.NewReader(raw))
	if parseErr != nil {
		log.Printf("mail.ReadMessage failed (saving raw bytes anyway): %v", parseErr)
		s.data.Date = time.Now()
		return s.onData(s.data, raw)
	}

	dec := new(mime.WordDecoder)

	fromHeader, err := dec.DecodeHeader(m.Header.Get("From"))
	if err != nil {
		log.Printf("decode From header: %v", err)
		fromHeader = m.Header.Get("From")
	}
	s.data.FromFormatted = fromHeader

	subject, err := dec.DecodeHeader(m.Header.Get("Subject"))
	if err != nil {
		log.Printf("decode Subject header: %v", err)
		subject = m.Header.Get("Subject")
	}
	s.data.Subject = subject

	date, err := m.Header.Date()
	if err != nil {
		log.Printf("parse Date header: %v", err)
		date = time.Now()
	}
	s.data.Date = date

	s.data.MessageId = m.Header.Get("Message-Id")
	s.data.RawHeaders = m.Header

	contentType := m.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "text/plain; charset=us-ascii"
	}

	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		log.Printf("parse Content-Type %q (treating as text/plain): %v", contentType, err)
		mediaType = "text/plain"
		params = map[string]string{"charset": "us-ascii"}
	}

	if strings.HasPrefix(mediaType, "multipart/") {
		partData, attachments, _ := parseParts(m.Body, params)
		s.data.Parts = partData
		s.data.Attachments = attachments
	} else {
		part, err := parseSinglePart(m.Body, m.Header, mediaType, params)
		if err != nil {
			log.Printf("parse body: %v", err)
		} else {
			s.data.Parts = []*types.PartData{part}
		}
	}

	return s.onData(s.data, raw)
}

func (s *session) Reset() {
	s.data = &types.MailData{}
}

func (s *session) Logout() error {
	return nil
}

// generateID returns a filename-safe, sortable, collision-resistant ID.
// Used as the storm primary key and as the on-disk filename for raw bytes,
// so it must never come from untrusted header content.
func generateID() string {
	var rnd [4]byte
	_, _ = crand.Read(rnd[:])
	return fmt.Sprintf("%d-%s", time.Now().UnixNano(), hex.EncodeToString(rnd[:]))
}

func newPartData(data []byte, mediaType string, charset string) types.PartData {
	return types.PartData{
		Data:      string(data),
		MediaType: mediaType,
		Charset:   charset,
	}
}

func newAttachmentData(data []byte, mediaType string, attachmentName string) types.Attachment {
	return types.Attachment{
		Data:      string(data),
		MediaType: mediaType,
		Name:      attachmentName,
	}
}

func parseParts(mimeData io.Reader, params map[string]string) ([]*types.PartData, []*types.Attachment, error) {
	boundary := params["boundary"]
	reader := multipart.NewReader(mimeData, boundary)
	if reader == nil {
		return nil, nil, nil
	}

	parts := []*types.PartData{}
	attachments := []*types.Attachment{}

	for {
		newPart, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Println("Error going through the MIME parts -", err)
			break
		}

		mediaType, params, err := mime.ParseMediaType(newPart.Header.Get("Content-Type"))

		if err == nil && strings.HasPrefix(mediaType, "multipart/") {
			p, a, err := parseParts(newPart, params)
			if err == nil {
				parts = append(parts, p...)
				attachments = append(attachments, a...)
			}
		} else {
			isAttachment, data, err := extractPartData(newPart, mediaType, params)
			if err == nil && data != nil {
				if isAttachment {
					attachment := newAttachmentData(data, mediaType, params["name"])
					attachments = append(attachments, &attachment)
				} else {
					part := newPartData(data, mediaType, params["charset"])
					parts = append(parts, &part)
				}
			}
		}
	}

	return parts, attachments, nil
}

// parseSinglePart reads a non-multipart body using already-parsed media type
// and params, so the caller can synthesize defaults when Content-Type is missing.
func parseSinglePart(body io.Reader, header mail.Header, mediaType string, params map[string]string) (*types.PartData, error) {
	partBytes, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}
	data, err := decodePart(partBytes, header.Get("Content-Transfer-Encoding"))
	if err != nil {
		return nil, err
	}
	part := newPartData(data, mediaType, params["charset"])
	return &part, nil
}

func extractPartData(part *multipart.Part, mediaType string, params map[string]string) (bool, []byte, error) {
	partBytes, err := io.ReadAll(part)

	if err != nil {
		return false, nil, err
	}

	contentDisposition := part.Header.Get("Content-Disposition")

	isAttachment := false
	if strings.Contains(contentDisposition, "attachment") {
		isAttachment = true
	}

	contentTransferEncoding := part.Header.Get("Content-Transfer-Encoding")

	data, err := decodePart(partBytes, contentTransferEncoding)

	if err != nil {
		return false, nil, err
	}

	return isAttachment, data, nil
}

func decodePart(partData []byte, contentTransferEncoding string) ([]byte, error) {
	var result []byte

	switch {
	case strings.Compare(strings.ToUpper(contentTransferEncoding), "BASE64") == 0:
		decodedContent, err := base64.StdEncoding.DecodeString(string(partData))
		if err != nil {
			log.Println("Error decoding base64 -", err)
			return nil, err
		} else {
			result = decodedContent
		}

	case strings.Compare(strings.ToUpper(contentTransferEncoding), "QUOTED-PRINTABLE") == 0:
		decodedContent, err := io.ReadAll(quotedprintable.NewReader(bytes.NewReader(partData)))
		if err != nil {
			log.Println("Error decoding quoted-printable -", err)
			return nil, err
		} else {
			result = decodedContent
		}

	default:
		result = partData
	}

	return result, nil
}
