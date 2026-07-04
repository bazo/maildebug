package types

import (
	"net/mail"
	"time"
)

type Config struct {
	SMTPPort string
	Username string
	Password string

	APIPort string
	DbName  string

	Domain            string
	ReadTimeout       int
	WriteTimeout      int
	MaxMessageBytes   int64
	MaxRecipients     int
	AllowInsecureAuth bool
}

type PartData struct {
	MediaType string `json:"mediaType"`
	Data      string `json:"data"`
	Charset   string `json:"charset"`
}

type Attachment struct {
	MediaType string `json:"mediaType"`
	// Data holds the raw decoded attachment bytes. It must be []byte (not
	// string): storm persists MailData as JSON, and JSON-encoding a string
	// rewrites every invalid-UTF-8 byte as U+FFFD, which corrupts binary
	// attachments like PDFs. []byte round-trips safely as base64.
	Data []byte `json:"data,omitempty"`
	Name string `json:"name"`
}

type MailData struct {
	Id            string        `json:"id" storm:"id"`
	MessageId     string        `json:"messageId"`
	From          string        `json:"from"`
	FromFormatted string        `json:"fromFormatted"`
	To            []string      `json:"to"`
	Subject       string        `json:"subject"`
	Date          time.Time     `json:"date" storm:"index"`
	Parts         []*PartData   `json:"parts"`
	Attachments   []*Attachment `json:"attachments"`
	RawHeaders    mail.Header   `json:"rawHeaders"`
}

type ApiResponse struct {
	Page       int64       `json:"page"`
	PagesCount int64       `json:"pagesCount"`
	Messages   []*MailData `json:"messages"`
}
