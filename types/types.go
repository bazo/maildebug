package types

import (
	"net/mail"
	"time"
)

type Config struct {
	SMTPPort string `default:"25"`
	Username string `default:"username"`
	Password string `default:"password"`

	APIPort string `default:"8100"`
	DbName  string `default:"mail.bolt"`

	Domain       string `default:"localhost"`
	ReadTimeout  int    `default:"10"`
	WriteTimeout int    `default:"10"`
	//1024 * 1024
	MaxMessageBytes   int  `default:"1048576"`
	MaxRecipients     int  `default:"50"`
	AllowInsecureAuth bool `default:"true"`
}

type PartData struct {
	MediaType string `json:"mediaType"`
	Data      string `json:"data"`
	Charset   string `json:"charset"`
}

type Attachment struct {
	MediaType string `json:"mediaType"`
	Data      string `json:"data,omitempty"`
	Name      string `json:"name"`
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
