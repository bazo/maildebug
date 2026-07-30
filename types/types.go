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

	// SpamAssassin is the host:port of a spamd daemon (e.g. "localhost:783").
	// Empty disables the spam-check endpoint.
	SpamAssassin string
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
	// ContentID is the part's Content-ID with the angle brackets stripped.
	// The HTML body references such parts as src="cid:<ContentID>"; the UI
	// resolves those back to the attachment endpoint.
	ContentID string `json:"contentId,omitempty"`
	// Inline marks a part the message renders itself (Content-Disposition:
	// inline) rather than offering as a download.
	Inline bool `json:"inline,omitempty"`
}

type MailData struct {
	Id            string        `json:"id" storm:"id"`
	MessageId     string        `json:"messageId"`
	From          string        `json:"from"`
	FromFormatted string        `json:"fromFormatted"`
	To            []string      `json:"to"`
	Subject       string        `json:"subject"`
	Date          time.Time     `json:"date" storm:"index"`
	Read          bool          `json:"read"`
	Parts         []*PartData   `json:"parts"`
	Attachments   []*Attachment `json:"attachments"`
	RawHeaders    mail.Header   `json:"rawHeaders"`
}

// SearchFilter describes a case-insensitive substring query over captured mail.
// Q matches ANY of recipient/sender/subject/body; the field-specific filters
// each must match (AND). Empty fields are ignored.
type SearchFilter struct {
	Q       string
	To      string
	From    string
	Subject string
	Body    string
}

// IsZero reports whether the filter has no active criteria.
func (f SearchFilter) IsZero() bool {
	return f.Q == "" && f.To == "" && f.From == "" && f.Subject == "" && f.Body == ""
}

// AttachmentSummary is the API view of an Attachment: every field except the
// bytes. Attachment.Data is tagged for storm's JSON persistence, so serving
// MailData directly would inline every attachment — base64 — into every list
// response. Clients fetch the bytes from /messages/:id/attachments/:index.
type AttachmentSummary struct {
	MediaType string `json:"mediaType"`
	Name      string `json:"name"`
	ContentID string `json:"contentId,omitempty"`
	Inline    bool   `json:"inline,omitempty"`
}

// MailDataResponse is MailData as served by the API. The embedded pointer
// promotes every MailData field, and the shallower Attachments field shadows
// the embedded one when encoding — so new MailData fields appear here for free.
type MailDataResponse struct {
	*MailData
	Attachments []*AttachmentSummary `json:"attachments"`
}

func NewMailDataResponse(message *MailData) *MailDataResponse {
	attachments := make([]*AttachmentSummary, 0, len(message.Attachments))

	for _, attachment := range message.Attachments {
		attachments = append(attachments, &AttachmentSummary{
			MediaType: attachment.MediaType,
			Name:      attachment.Name,
			ContentID: attachment.ContentID,
			Inline:    attachment.Inline,
		})
	}

	return &MailDataResponse{MailData: message, Attachments: attachments}
}

type ApiResponse struct {
	Page       int64               `json:"page"`
	PagesCount int64               `json:"pagesCount"`
	Unread     int                 `json:"unread"`
	Messages   []*MailDataResponse `json:"messages"`
}
