package check

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"sync"

	"golang.org/x/net/html"
)

type Link struct {
	URL    string `json:"url"`
	Kind   string `json:"kind"` // "link" | "image"
	Status int    `json:"status"`
	OK     bool   `json:"ok"`
	Error  string `json:"error,omitempty"`
}

type LinkCheckResult struct {
	Links  []Link `json:"links"`
	Total  int    `json:"total"`
	Failed int    `json:"failed"`
}

var urlRe = regexp.MustCompile(`https?://[^\s<>"')]+`)

// ExtractLinks gathers unique http(s) URLs from an HTML body (a[href], img[src])
// and a plain-text body (bare URLs). Non-http schemes (mailto, tel, #anchors,
// cid) are ignored — they aren't reachable over HTTP.
func ExtractLinks(htmlBody, textBody string) []Link {
	seen := map[string]int{} // url -> index in out
	out := []Link{}

	add := func(rawURL, kind string) {
		u := strings.TrimSpace(rawURL)
		if !strings.HasPrefix(strings.ToLower(u), "http://") && !strings.HasPrefix(strings.ToLower(u), "https://") {
			return
		}
		if idx, ok := seen[u]; ok {
			// A URL used as both link and image is reported as a link.
			if kind == "link" {
				out[idx].Kind = "link"
			}
			return
		}
		seen[u] = len(out)
		out = append(out, Link{URL: u, Kind: kind})
	}

	if strings.TrimSpace(htmlBody) != "" {
		if doc, err := html.Parse(strings.NewReader(htmlBody)); err == nil {
			var walk func(*html.Node)
			walk = func(n *html.Node) {
				if n.Type == html.ElementNode {
					switch n.Data {
					case "a":
						if href, ok := attr(n, "href"); ok {
							add(href, "link")
						}
					case "img":
						if src, ok := attr(n, "src"); ok {
							add(src, "image")
						}
					}
				}
				for c := n.FirstChild; c != nil; c = c.NextSibling {
					walk(c)
				}
			}
			walk(doc)
		}
	}

	for _, m := range urlRe.FindAllString(textBody, -1) {
		add(strings.TrimRight(m, ".,;:!?"), "link")
	}

	return out
}

func attr(n *html.Node, key string) (string, bool) {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val, true
		}
	}
	return "", false
}

// CheckLinks probes each link concurrently (HEAD, falling back to GET when HEAD
// is rejected) and fills in Status/OK/Error. concurrency<=0 defaults to 8.
func CheckLinks(ctx context.Context, client *http.Client, links []Link, concurrency int) LinkCheckResult {
	if concurrency <= 0 {
		concurrency = 8
	}
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for i := range links {
		wg.Add(1)
		sem <- struct{}{}
		go func(l *Link) {
			defer wg.Done()
			defer func() { <-sem }()
			probe(ctx, client, l)
		}(&links[i])
	}
	wg.Wait()

	res := LinkCheckResult{Links: links, Total: len(links)}
	for _, l := range links {
		if !l.OK {
			res.Failed++
		}
	}
	return res
}

func probe(ctx context.Context, client *http.Client, l *Link) {
	status, err := do(ctx, client, http.MethodHead, l.URL)
	// Many servers reject HEAD (405/501) — retry with GET before giving up.
	if err != nil || status == http.StatusMethodNotAllowed || status == http.StatusNotImplemented {
		if s2, err2 := do(ctx, client, http.MethodGet, l.URL); err2 == nil {
			status, err = s2, nil
		} else if err != nil {
			err = err2
		}
	}
	if err != nil {
		l.Error = err.Error()
		l.OK = false
		return
	}
	l.Status = status
	l.OK = status >= 200 && status < 400
}

func do(ctx context.Context, client *http.Client, method, url string) (int, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "maildebug-linkcheck/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	resp.Body.Close()
	return resp.StatusCode, nil
}
