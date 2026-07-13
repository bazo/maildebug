package storage

import (
	"maildebug/types"
	"strings"
)

// Matches reports whether a message satisfies every active criterion of the
// filter (case-insensitive substring). This is the single shared implementation
// used by both the HTTP search API and the MCP search/wait tools.
func Matches(m *types.MailData, f types.SearchFilter) bool {
	if f.To != "" && !matchesRecipient(m, f.To) {
		return false
	}
	if f.From != "" && !containsFold(m.From, f.From) && !containsFold(m.FromFormatted, f.From) {
		return false
	}
	if f.Subject != "" && !containsFold(m.Subject, f.Subject) {
		return false
	}
	if f.Body != "" && !matchesBody(m, f.Body) {
		return false
	}
	if f.Q != "" && !matchesAny(m, f.Q) {
		return false
	}
	return true
}

// matchesAny matches q against any of recipients, sender, subject or body.
func matchesAny(m *types.MailData, q string) bool {
	if containsFold(m.Subject, q) || containsFold(m.From, q) || containsFold(m.FromFormatted, q) {
		return true
	}
	return matchesRecipient(m, q) || matchesBody(m, q)
}

func matchesRecipient(m *types.MailData, needle string) bool {
	for _, r := range m.To {
		if containsFold(r, needle) {
			return true
		}
	}
	return false
}

func matchesBody(m *types.MailData, needle string) bool {
	for _, p := range m.Parts {
		if p != nil && containsFold(p.Data, needle) {
			return true
		}
	}
	return false
}

func containsFold(haystack, needle string) bool {
	return strings.Contains(strings.ToLower(haystack), strings.ToLower(needle))
}

// SearchMessages returns all messages matching the filter, newest first. Bodies
// are searched, so decoded attachment bytes are stripped from the result (as in
// LoadMessages) — callers fetch attachments separately.
func (s *Storage) SearchMessages(f types.SearchFilter) ([]*types.MailData, error) {
	messages := make([]*types.MailData, 0)

	query := s.db.Select().Reverse().OrderBy("Date")
	err := query.Each(new(types.MailData), func(record interface{}) error {
		message := record.(*types.MailData)
		if !Matches(message, f) {
			return nil
		}
		for _, att := range message.Attachments {
			att.Data = nil
		}
		messages = append(messages, message)
		return nil
	})

	return messages, err
}
