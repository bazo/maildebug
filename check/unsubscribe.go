// Package check implements Mailpit-style per-message QA analysis:
// List-Unsubscribe validation, link/image reachability, and SpamAssassin
// scoring. Pure (no-network) checks are grouped by Run; link and spam checks
// are exposed separately because they reach out over the network.
package check

import (
	"net/mail"
	"strings"
)

// Status is a traffic-light result shared by all checks.
type Status string

const (
	StatusPass Status = "pass"
	StatusWarn Status = "warn"
	StatusFail Status = "fail"
)

// Result aggregates the cheap, no-network checks for a message.
type Result struct {
	Unsubscribe UnsubscribeResult `json:"unsubscribe"`
	HTML        HTMLCheckResult   `json:"html"`
}

type UnsubscribeURI struct {
	Type string `json:"type"` // "https" | "mailto" | "http" | "other"
	URI  string `json:"uri"`
}

type UnsubscribeResult struct {
	Present  bool             `json:"present"`
	OneClick bool             `json:"oneClick"`
	URIs     []UnsubscribeURI `json:"uris"`
	Status   Status           `json:"status"`
	Notes    []string         `json:"notes"`
}

// Run executes every no-network check against the message headers and HTML body.
func Run(headers mail.Header, htmlBody string) Result {
	return Result{
		Unsubscribe: CheckUnsubscribe(headers),
		HTML:        CheckHTML(htmlBody),
	}
}

// CheckUnsubscribe validates the List-Unsubscribe / List-Unsubscribe-Post
// headers, including RFC 8058 one-click compliance (a POST=One-Click list must
// offer an https URI).
func CheckUnsubscribe(headers mail.Header) UnsubscribeResult {
	raw := headers.Get("List-Unsubscribe")
	res := UnsubscribeResult{URIs: []UnsubscribeURI{}, Notes: []string{}}

	if strings.TrimSpace(raw) == "" {
		res.Status = StatusWarn
		res.Notes = append(res.Notes, "No List-Unsubscribe header — recommended so recipients can opt out.")
		return res
	}
	res.Present = true

	for _, uri := range parseAngleList(raw) {
		res.URIs = append(res.URIs, UnsubscribeURI{Type: uriType(uri), URI: uri})
	}

	post := headers.Get("List-Unsubscribe-Post")
	res.OneClick = strings.EqualFold(strings.TrimSpace(post), "List-Unsubscribe=One-Click")

	if len(res.URIs) == 0 {
		res.Status = StatusFail
		res.Notes = append(res.Notes, "List-Unsubscribe present but contains no valid <URI> entries.")
		return res
	}

	hasHTTPS := false
	hasMailto := false
	for _, u := range res.URIs {
		if u.Type == "https" {
			hasHTTPS = true
		}
		if u.Type == "mailto" {
			hasMailto = true
		}
	}

	res.Status = StatusPass
	if res.OneClick && !hasHTTPS {
		res.Status = StatusFail
		res.Notes = append(res.Notes, "One-Click unsubscribe declared but no https URI is present (RFC 8058 requires one).")
	}
	if !res.OneClick && hasHTTPS {
		res.Status = StatusWarn
		res.Notes = append(res.Notes, "An https unsubscribe URI is present but List-Unsubscribe-Post is missing — add it for one-click support.")
	}
	if !hasHTTPS && !hasMailto {
		res.Status = StatusWarn
		res.Notes = append(res.Notes, "Unsubscribe URIs use neither https nor mailto — clients may not honor them.")
	}
	return res
}

// parseAngleList extracts the <...> entries from a comma-separated header value.
func parseAngleList(v string) []string {
	var out []string
	for _, part := range strings.Split(v, ",") {
		part = strings.TrimSpace(part)
		start := strings.Index(part, "<")
		end := strings.LastIndex(part, ">")
		if start >= 0 && end > start {
			uri := strings.TrimSpace(part[start+1 : end])
			if uri != "" {
				out = append(out, uri)
			}
		}
	}
	return out
}

func uriType(uri string) string {
	lower := strings.ToLower(uri)
	switch {
	case strings.HasPrefix(lower, "https:"):
		return "https"
	case strings.HasPrefix(lower, "http:"):
		return "http"
	case strings.HasPrefix(lower, "mailto:"):
		return "mailto"
	default:
		return "other"
	}
}
