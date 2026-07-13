package check

import (
	"sort"
	"strings"

	"golang.org/x/net/html"
)

type HTMLFinding struct {
	Feature string `json:"feature"`
	Status  Status `json:"status"`
	Count   int    `json:"count"`
	Note    string `json:"note"`
}

type HTMLCheckResult struct {
	HasHTML  bool          `json:"hasHtml"`
	Status   Status        `json:"status"`
	Findings []HTMLFinding `json:"findings"`
}

// elementRule flags a whole HTML element that email clients commonly strip or
// mishandle.
type elementRule struct {
	tag     string
	status  Status
	note    string
	feature string
}

var elementRules = []elementRule{
	{"script", StatusFail, "Scripts are stripped by virtually all email clients.", "<script>"},
	{"link", StatusFail, "External stylesheets are not loaded by most clients — inline styles instead.", "<link> stylesheet"},
	{"iframe", StatusFail, "Iframes are blocked by nearly all clients.", "<iframe>"},
	{"form", StatusWarn, "Forms are stripped or disabled in most clients; link out instead.", "<form>"},
	{"input", StatusWarn, "Form inputs are unreliable across clients.", "<input>"},
	{"button", StatusWarn, "Native buttons render inconsistently; use a styled anchor.", "<button>"},
	{"svg", StatusWarn, "SVG is unsupported in Gmail and Outlook — use PNG.", "<svg>"},
	{"video", StatusWarn, "HTML5 video has limited support; provide a poster image fallback.", "<video>"},
	{"audio", StatusWarn, "HTML5 audio is largely unsupported.", "<audio>"},
	{"object", StatusWarn, "<object>/<embed> is blocked by most clients.", "<object>/<embed>"},
	{"embed", StatusWarn, "<object>/<embed> is blocked by most clients.", "<object>/<embed>"},
}

// cssRule flags a CSS feature (matched as a lowercase substring of the combined
// inline + <style> CSS) that fails or degrades in major clients.
type cssRule struct {
	needles []string
	status  Status
	note    string
	feature string
}

var cssRules = []cssRule{
	{[]string{"display:flex", "display:inline-flex"}, StatusWarn, "Flexbox is ignored by Outlook (Word engine); use tables for layout.", "display:flex"},
	{[]string{"display:grid"}, StatusWarn, "CSS grid is unsupported in Outlook and Gmail; use tables.", "display:grid"},
	{[]string{"position:absolute", "position:fixed", "position:sticky"}, StatusWarn, "CSS positioning is unsupported in Outlook and mostly ignored.", "position:absolute/fixed"},
	{[]string{"background-image", "background:url", "background: url"}, StatusWarn, "CSS background images need VML fallback for Outlook.", "css background-image"},
	{[]string{"@font-face"}, StatusWarn, "Web fonts fall back to a default font in Outlook and some clients.", "@font-face web fonts"},
	{[]string{"transform:", "transition:", "animation:"}, StatusWarn, "CSS transform/transition/animation is unsupported in Outlook.", "css transform/animation"},
	{[]string{"vw", "vh"}, StatusWarn, "Viewport units (vw/vh) are unsupported in many clients.", "viewport units"},
}

// CheckHTML scans an HTML body for high-impact email-client compatibility
// issues. It is a curated heuristic, not a full caniemail.com port: it flags
// well-known gotchas rather than scoring every client individually.
func CheckHTML(htmlBody string) HTMLCheckResult {
	res := HTMLCheckResult{Findings: []HTMLFinding{}, Status: StatusPass}
	if strings.TrimSpace(htmlBody) == "" {
		return res
	}
	res.HasHTML = true

	doc, err := html.Parse(strings.NewReader(htmlBody))
	if err != nil {
		return res
	}

	elementCounts := map[string]int{}
	var styleCSS strings.Builder // inline + <style> css, lowercased
	hasStyleTag := false
	hasMediaQuery := false

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			elementCounts[n.Data]++
			if n.Data == "style" {
				hasStyleTag = true
				if n.FirstChild != nil {
					styleCSS.WriteString(strings.ToLower(n.FirstChild.Data))
					styleCSS.WriteString(" ")
				}
			}
			for _, a := range n.Attr {
				if a.Key == "style" {
					styleCSS.WriteString(strings.ToLower(a.Val))
					styleCSS.WriteString(" ")
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	css := normalizeCSS(styleCSS.String())
	hasMediaQuery = strings.Contains(css, "@media")

	for _, rule := range elementRules {
		if c := elementCounts[rule.tag]; c > 0 {
			res.Findings = append(res.Findings, HTMLFinding{
				Feature: rule.feature, Status: rule.status, Count: c, Note: rule.note,
			})
		}
	}

	// <style> and @media only work where the client keeps <style> blocks.
	if hasStyleTag {
		note := "Embedded <style> is supported by most modern clients but stripped by some (e.g. older/roundcube)."
		st := StatusWarn
		if hasMediaQuery {
			note = "Media queries require the client to keep <style>; unsupported in some webmail — ensure the layout works without them."
		}
		res.Findings = append(res.Findings, HTMLFinding{
			Feature: "<style> block", Status: st, Count: elementCounts["style"], Note: note,
		})
	}

	for _, rule := range cssRules {
		count := 0
		for _, n := range rule.needles {
			count += strings.Count(css, n)
		}
		if count > 0 {
			res.Findings = append(res.Findings, HTMLFinding{
				Feature: rule.feature, Status: rule.status, Count: count, Note: rule.note,
			})
		}
	}

	res.Status = worstStatus(res.Findings)
	sort.SliceStable(res.Findings, func(i, j int) bool {
		return statusRank(res.Findings[i].Status) > statusRank(res.Findings[j].Status)
	})
	return res
}

// normalizeCSS strips spaces around colons so "position : absolute" matches the
// "position:absolute" needles.
func normalizeCSS(css string) string {
	css = strings.ReplaceAll(css, " :", ":")
	css = strings.ReplaceAll(css, ": ", ":")
	return css
}

func statusRank(s Status) int {
	switch s {
	case StatusFail:
		return 2
	case StatusWarn:
		return 1
	default:
		return 0
	}
}

func worstStatus(findings []HTMLFinding) Status {
	worst := StatusPass
	for _, f := range findings {
		if statusRank(f.Status) > statusRank(worst) {
			worst = f.Status
		}
	}
	return worst
}
