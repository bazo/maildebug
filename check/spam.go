package check

import (
	"bufio"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

type SpamRule struct {
	Score       float64 `json:"score"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
}

type SpamResult struct {
	IsSpam    bool       `json:"isSpam"`
	Score     float64    `json:"score"`
	Threshold float64    `json:"threshold"`
	Rules     []SpamRule `json:"rules"`
}

// SpamCheck submits the raw message to a SpamAssassin spamd daemon at addr
// (host:port, e.g. "localhost:783") using the SPAMC/1.5 REPORT command and
// parses the score, threshold and triggered rules.
func SpamCheck(addr string, raw []byte) (SpamResult, error) {
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return SpamResult{}, fmt.Errorf("connect spamd %s: %w", addr, err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(30 * time.Second))

	fmt.Fprintf(conn, "REPORT SPAMC/1.5\r\n")
	fmt.Fprintf(conn, "Content-length: %d\r\n", len(raw))
	fmt.Fprintf(conn, "\r\n")
	if _, err := conn.Write(raw); err != nil {
		return SpamResult{}, fmt.Errorf("write to spamd: %w", err)
	}
	// Half-close so spamd sees EOF and starts responding.
	if tcp, ok := conn.(*net.TCPConn); ok {
		tcp.CloseWrite()
	}

	return parseSpamResponse(bufio.NewScanner(conn))
}

func parseSpamResponse(sc *bufio.Scanner) (SpamResult, error) {
	var res SpamResult
	sawStatus := false
	inRules := false

	for sc.Scan() {
		line := sc.Text()
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(line, "SPAMD/") {
			sawStatus = true
			continue
		}
		if strings.HasPrefix(line, "Spam:") {
			parseSpamHeader(line, &res)
			continue
		}
		// The report table separates the header from per-rule rows with a
		// line of dashes; rows look like "  1.2 RULE_NAME  Description".
		if strings.HasPrefix(trimmed, "----") {
			inRules = true
			continue
		}
		if inRules {
			if rule, ok := parseRuleRow(line); ok {
				res.Rules = append(res.Rules, rule)
			}
		}
	}
	if err := sc.Err(); err != nil {
		return res, err
	}
	if !sawStatus {
		return res, fmt.Errorf("no SPAMD response header")
	}
	return res, nil
}

// parseSpamHeader parses e.g. "Spam: True ; 5.2 / 5.0".
func parseSpamHeader(line string, res *SpamResult) {
	rest := strings.TrimSpace(strings.TrimPrefix(line, "Spam:"))
	parts := strings.SplitN(rest, ";", 2)
	res.IsSpam = strings.EqualFold(strings.TrimSpace(parts[0]), "true")
	if len(parts) == 2 {
		sv := strings.SplitN(parts[1], "/", 2)
		if len(sv) == 2 {
			res.Score = atof(sv[0])
			res.Threshold = atof(sv[1])
		}
	}
}

// parseRuleRow parses a report row "  1.2 RULE_NAME  Description text".
func parseRuleRow(line string) (SpamRule, bool) {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return SpamRule{}, false
	}
	score, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return SpamRule{}, false
	}
	name := fields[1]
	desc := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), fields[0]))
	desc = strings.TrimSpace(strings.TrimPrefix(desc, name))
	return SpamRule{Score: score, Name: name, Description: desc}, true
}

func atof(s string) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return f
}
