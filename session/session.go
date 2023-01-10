package session

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"mail-debug/types"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"

	"github.com/emersion/go-smtp"
)

type dataCallback func(*types.MailData) error

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
	m, err := mail.ReadMessage(r)

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
			partData, _ := parsePart(m.Body, params)
			s.data.Parts = partData
		} else {
			data, _ := io.ReadAll(m.Body)
			s.data.Parts = []types.PartData{
				newPartData(data, mediaType, params["charset"]),
			}
		}

	}

	dec := new(mime.WordDecoder)
	from, err := dec.DecodeHeader(m.Header.Get("From"))
	//to, _ := dec.DecodeHeader(m.Header.Get("To"))

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

	//date := carbon.Parse(m.Header.Get("Date"))

	s.data.MessageId = m.Header.Get("Message-Id")
	s.data.Date = date
	s.data.FromFormatted = from
	s.data.Subject = subject

	s.onData(s.data)

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

func parsePart(mimeData io.Reader, params map[string]string) ([]types.PartData, error) {
	boundary := params["boundary"]
	// Instantiate a new io.Reader dedicated to MIME multipart parsing
	// using multipart.NewReader()
	reader := multipart.NewReader(mimeData, boundary)
	if reader == nil {
		return nil, nil
	}

	parts := []types.PartData{}

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
			parsePart(newPart, params)

		} else {

			// Not a new nested multipart.
			// We can do something here with the data of this single MIME part.
			data, err := extractPartData(newPart)
			if err == nil && data != nil {
				parts = append(parts, newPartData(data, mediaType, params["charset"]))
			}
		}

	}

	return parts, nil
}

func extractPartData(part *multipart.Part) ([]byte, error) {
	partData, err := io.ReadAll(part)

	if err != nil {
		return nil, err
	}

	contentTransferEncoding := part.Header.Get("Content-Transfer-Encoding")

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
