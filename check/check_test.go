package check

import (
	"net/mail"
	"net/textproto"
	"testing"
)

func hdr(pairs map[string]string) mail.Header {
	h := textproto.MIMEHeader{}
	for k, v := range pairs {
		h.Set(k, v)
	}
	return mail.Header(h)
}

func TestCheckUnsubscribe(t *testing.T) {
	tests := []struct {
		name     string
		headers  map[string]string
		want     Status
		oneClick bool
		uris     int
	}{
		{"missing", map[string]string{}, StatusWarn, false, 0},
		{
			"valid one-click",
			map[string]string{
				"List-Unsubscribe":      "<https://x.com/u>, <mailto:u@x.com>",
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
			StatusPass, true, 2,
		},
		{
			"one-click without https fails",
			map[string]string{
				"List-Unsubscribe":      "<mailto:u@x.com>",
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
			StatusFail, true, 1,
		},
		{
			"https but no post header warns",
			map[string]string{"List-Unsubscribe": "<https://x.com/u>"},
			StatusWarn, false, 1,
		},
		{
			"malformed no brackets fails",
			map[string]string{"List-Unsubscribe": "https://x.com/u"},
			StatusFail, false, 0,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := CheckUnsubscribe(hdr(tc.headers))
			if got.Status != tc.want {
				t.Errorf("status = %q, want %q (notes: %v)", got.Status, tc.want, got.Notes)
			}
			if got.OneClick != tc.oneClick {
				t.Errorf("oneClick = %v, want %v", got.OneClick, tc.oneClick)
			}
			if len(got.URIs) != tc.uris {
				t.Errorf("uris = %d, want %d", len(got.URIs), tc.uris)
			}
		})
	}
}

func TestExtractLinks(t *testing.T) {
	html := `<a href="https://good.com/a">a</a><a href="mailto:x@y.com">m</a>
	         <img src="http://img.com/1.png"><a href="#top">skip</a>`
	text := "visit https://text.com/page and http://img.com/1.png too."
	links := ExtractLinks(html, text)

	byURL := map[string]Link{}
	for _, l := range links {
		byURL[l.URL] = l
	}
	// mailto and #anchor are dropped; http/https kept; duplicate img url deduped.
	if len(links) != 3 {
		t.Fatalf("got %d links, want 3: %+v", len(links), links)
	}
	if byURL["http://img.com/1.png"].Kind != "link" {
		t.Errorf("url used as both image and text link should be classified as link")
	}
	if _, ok := byURL["mailto:x@y.com"]; ok {
		t.Errorf("mailto should be excluded")
	}
}

func TestCheckHTML(t *testing.T) {
	res := CheckHTML(`<html><body><script>x</script><div style="display:flex">hi</div></body></html>`)
	if !res.HasHTML {
		t.Fatal("hasHtml should be true")
	}
	if res.Status != StatusFail {
		t.Errorf("status = %q, want fail (script present)", res.Status)
	}
	var sawScript, sawFlex bool
	for _, f := range res.Findings {
		if f.Feature == "<script>" {
			sawScript = true
		}
		if f.Feature == "display:flex" {
			sawFlex = true
		}
	}
	if !sawScript || !sawFlex {
		t.Errorf("expected script and flex findings, got %+v", res.Findings)
	}

	if empty := CheckHTML(""); empty.HasHTML {
		t.Errorf("empty body should not report hasHtml")
	}
}

func TestParseSpamHeader(t *testing.T) {
	var r SpamResult
	parseSpamHeader("Spam: True ; 6.1 / 5.0", &r)
	if !r.IsSpam || r.Score != 6.1 || r.Threshold != 5.0 {
		t.Errorf("got %+v", r)
	}
}
