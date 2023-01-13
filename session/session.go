package session

import (
	"bytes"
	"encoding/base64"
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

	"github.com/emersion/go-smtp"
)

type dataCallback func(*types.MailData, bytes.Buffer) error

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

func (s *session) Rcpt(to string) error {
	s.data.To = append(s.data.To, to)
	return nil
}

func (s *session) Data(r io.Reader) error {
	var b bytes.Buffer
	t := io.TeeReader(r, &b)

	// data, err := io.ReadAll(t)
	// log.Println(data)
	// if err != nil {
	// 	return err
	// }

	m, err := mail.ReadMessage(t)
	log.Println(b.String())
	if err != nil {
		return err
	}

	if err != nil {
		return err
	}

	contentType := m.Header.Get("Content-Type")
	if contentType != "" {
		mediaType, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			log.Fatal(err)
		}

		if strings.HasPrefix(mediaType, "multipart/") {
			partData, attachments, _ := parseParts(m.Body, params)
			s.data.Parts = partData
			s.data.Attachments = attachments
		} else {
			data, _ := io.ReadAll(m.Body)
			part := newPartData(data, mediaType, params["charset"])
			s.data.Parts = []*types.PartData{
				&part,
			}
		}
	}

	dec := new(mime.WordDecoder)
	from, err := dec.DecodeHeader(m.Header.Get("From"))

	if err != nil {
		return err
	}

	subject, err := dec.DecodeHeader(m.Header.Get("Subject"))

	if err != nil {
		return err
	}

	date, err := m.Header.Date()

	if err != nil {
		return err
	}

	messageId := m.Header.Get("Message-Id")

	parts := strings.Split(messageId, "@")

	id := parts[0][1:len(parts[0])]

	s.data.Id = id
	s.data.MessageId = messageId
	s.data.Date = date
	s.data.FromFormatted = from
	s.data.Subject = subject
	s.data.RawHeaders = m.Header
	s.onData(s.data, b)

	return nil
}

func (s *session) Reset() {}

func (s *session) Logout() error {
	return nil
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
	// Instantiate a new io.Reader dedicated to MIME multipart parsing
	// using multipart.NewReader()
	reader := multipart.NewReader(mimeData, boundary)
	if reader == nil {
		return nil, nil, nil
	}

	parts := []*types.PartData{}
	attachments := []*types.Attachment{}

	// Go through each of the MIME part of the message Body with NextPart(),
	for {
		newPart, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			fmt.Println("Error going through the MIME parts -", err)
			break
		}

		mediaType, params, err := mime.ParseMediaType(newPart.Header.Get("Content-Type"))

		if err == nil && strings.HasPrefix(mediaType, "multipart/") {
			// This is a new multipart to be handled recursively
			p, a, err := parseParts(newPart, params)
			if err == nil {
				parts = append(parts, p...)
				attachments = append(attachments, a...)
			}
		} else {
			// Not a new nested multipart.
			// We can do something here with the data of this single MIME part.
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
	case strings.Compare(contentTransferEncoding, "BASE64") == 0:
		decodedContent, err := base64.StdEncoding.DecodeString(string(partData))
		if err != nil {
			log.Println("Error decoding base64 -", err)
			return nil, err
		} else {
			result = decodedContent
		}

	case strings.Compare(contentTransferEncoding, "QUOTED-PRINTABLE") == 0:
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
