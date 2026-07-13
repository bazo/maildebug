// Package mcpserver exposes the captured mailbox over the Model Context
// Protocol so an LLM/agent can verify emails the tool has captured. It is
// served over Streamable HTTP from the same Go HTTP server (see main.go).
package mcpserver

import (
	"context"
	"fmt"
	"time"

	"maildebug/storage"
	"maildebug/types"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type emailSummary struct {
	ID          string   `json:"id" jsonschema:"unique email id, pass to read_email"`
	Subject     string   `json:"subject"`
	From        string   `json:"from"`
	To          []string `json:"to"`
	Date        string   `json:"date" jsonschema:"RFC3339 timestamp"`
	HasHTML     bool     `json:"hasHtml"`
	HasText     bool     `json:"hasText"`
	Attachments []string `json:"attachments" jsonschema:"attachment filenames"`
}

type emailDetail struct {
	ID          string              `json:"id"`
	Subject     string              `json:"subject"`
	From        string              `json:"from"`
	To          []string            `json:"to"`
	Date        string              `json:"date"`
	HTML        string              `json:"html" jsonschema:"decoded text/html body, empty if none"`
	Text        string              `json:"text" jsonschema:"decoded text/plain body, empty if none"`
	Headers     map[string][]string `json:"headers"`
	Attachments []string            `json:"attachments"`
}

func summarize(m *types.MailData) emailSummary {
	atts := make([]string, 0, len(m.Attachments))
	for _, a := range m.Attachments {
		atts = append(atts, a.Name)
	}
	return emailSummary{
		ID:          m.Id,
		Subject:     m.Subject,
		From:        m.From,
		To:          m.To,
		Date:        m.Date.Format(time.RFC3339),
		HasHTML:     findPart(m, "text/html") != "",
		HasText:     findPart(m, "text/plain") != "",
		Attachments: atts,
	}
}

func findPart(m *types.MailData, mediaType string) string {
	for _, p := range m.Parts {
		if p != nil && p.MediaType == mediaType {
			return p.Data
		}
	}
	return ""
}

// --- tool I/O types ---

type listInput struct {
	Page  int64 `json:"page,omitempty" jsonschema:"1-based page, default 1"`
	Limit int64 `json:"limit,omitempty" jsonschema:"max emails per page, default 50"`
}

type listOutput struct {
	Emails     []emailSummary `json:"emails"`
	Total      int64          `json:"total"`
	Page       int64          `json:"page"`
	PagesCount int64          `json:"pagesCount"`
}

type readInput struct {
	ID string `json:"id" jsonschema:"email id from list_emails or search_emails"`
}

type searchInput struct {
	To      string `json:"to,omitempty" jsonschema:"substring match on a recipient"`
	From    string `json:"from,omitempty" jsonschema:"substring match on the sender"`
	Subject string `json:"subject,omitempty" jsonschema:"substring match on the subject"`
	Body    string `json:"body,omitempty" jsonschema:"substring match on the html or text body"`
}

type searchOutput struct {
	Emails []emailSummary `json:"emails"`
	Count  int            `json:"count"`
}

type waitInput struct {
	To        string `json:"to,omitempty" jsonschema:"substring match on a recipient"`
	From      string `json:"from,omitempty" jsonschema:"substring match on the sender"`
	Subject   string `json:"subject,omitempty" jsonschema:"substring match on the subject"`
	Body      string `json:"body,omitempty" jsonschema:"substring match on the html or text body"`
	TimeoutMs int    `json:"timeoutMs,omitempty" jsonschema:"max time to wait in ms, default 30000"`
}

type waitOutput struct {
	Email emailSummary `json:"email"`
}

type clearOutput struct {
	Cleared bool `json:"cleared"`
}

// New builds the maildebug MCP server with the email-verification toolset.
func New(store *storage.Storage) *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{
		Name:    "maildebug",
		Version: "1.0.0",
	}, nil)

	mcp.AddTool(s, &mcp.Tool{
		Name:        "list_emails",
		Description: "List captured emails (newest first) with subject, sender, recipients and date. Use read_email for full content.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, listOutput, error) {
		page := in.Page
		if page < 1 {
			page = 1
		}
		limit := in.Limit
		if limit < 1 {
			limit = 50
		}
		msgs, total, err := store.LoadMessages(page, limit)
		if err != nil {
			return nil, listOutput{}, err
		}
		out := listOutput{Page: page, Total: total}
		for _, m := range msgs {
			out.Emails = append(out.Emails, summarize(m))
		}
		out.PagesCount = (total + limit - 1) / limit
		return nil, out, nil
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "read_email",
		Description: "Read one captured email by id: decoded HTML body, plain text body, headers and attachment names.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in readInput) (*mcp.CallToolResult, emailDetail, error) {
		if in.ID == "" {
			return nil, emailDetail{}, fmt.Errorf("id is required")
		}
		m, err := store.LoadMessage(in.ID)
		if err != nil {
			return nil, emailDetail{}, fmt.Errorf("email %q not found: %w", in.ID, err)
		}
		atts := make([]string, 0, len(m.Attachments))
		for _, a := range m.Attachments {
			atts = append(atts, a.Name)
		}
		return nil, emailDetail{
			ID:          m.Id,
			Subject:     m.Subject,
			From:        m.From,
			To:          m.To,
			Date:        m.Date.Format(time.RFC3339),
			HTML:        findPart(m, "text/html"),
			Text:        findPart(m, "text/plain"),
			Headers:     m.RawHeaders,
			Attachments: atts,
		}, nil
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "search_emails",
		Description: "Find captured emails matching any combination of recipient, sender, subject or body (case-insensitive substring). All provided filters must match.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in searchInput) (*mcp.CallToolResult, searchOutput, error) {
		msgs, err := store.SearchMessages(types.SearchFilter{To: in.To, From: in.From, Subject: in.Subject, Body: in.Body})
		if err != nil {
			return nil, searchOutput{}, err
		}
		out := searchOutput{Emails: []emailSummary{}}
		for _, m := range msgs {
			out.Emails = append(out.Emails, summarize(m))
		}
		out.Count = len(out.Emails)
		return nil, out, nil
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "wait_for_email",
		Description: "Poll until an email matching the given filters is captured, or time out. Use to verify async flows (e.g. send a signup, then wait for the welcome email).",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in waitInput) (*mcp.CallToolResult, waitOutput, error) {
		if in.To == "" && in.From == "" && in.Subject == "" && in.Body == "" {
			return nil, waitOutput{}, fmt.Errorf("at least one filter (to, from, subject, body) is required")
		}
		timeout := time.Duration(in.TimeoutMs) * time.Millisecond
		if timeout <= 0 {
			timeout = 30 * time.Second
		}
		deadline := time.Now().Add(timeout)
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()

		filter := types.SearchFilter{To: in.To, From: in.From, Subject: in.Subject, Body: in.Body}
		for {
			msgs, err := store.SearchMessages(filter)
			if err != nil {
				return nil, waitOutput{}, err
			}
			if len(msgs) > 0 {
				return nil, waitOutput{Email: summarize(msgs[0])}, nil
			}
			if time.Now().After(deadline) {
				return nil, waitOutput{}, fmt.Errorf("no matching email within %dms", timeout.Milliseconds())
			}
			select {
			case <-ctx.Done():
				return nil, waitOutput{}, ctx.Err()
			case <-ticker.C:
			}
		}
	})

	mcp.AddTool(s, &mcp.Tool{
		Name:        "clear_emails",
		Description: "Delete all captured emails so a verification run starts from a clean inbox.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, clearOutput, error) {
		if err := store.DeleteMessages(); err != nil {
			return nil, clearOutput{}, err
		}
		return nil, clearOutput{Cleared: true}, nil
	})

	return s
}
