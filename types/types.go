package types

import "time"

type Config struct {
	SMTPPort string `default:"1025"`
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
	MediaType string
	Data      string
	Charset   string
}

type MailData struct {
	Id            string     `json:"id"`
	MessageId     string     `json:"messageId"`
	From          string     `json:"from"`
	FromFormatted string     `json:"fromFormatted"`
	To            []string   `json:"to"`
	Subject       string     `json:"subject"`
	Date          time.Time  `json:"date"`
	Parts         []PartData `json:"parts"`
}

type ApiResponse struct {
	Page       int64       `json:"page"`
	PagesCount int64       `json:"pagesCount"`
	Messages   []*MailData `json:"messages"`
}
