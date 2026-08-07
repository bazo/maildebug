package storage

import (
	"maildebug/types"
	"testing"
	"time"
)

// openTemp gives each test its own storm DB. Init resolves "data/<name>"
// relative to the working directory, so the chdir is what isolates it.
func openTemp(t *testing.T) *Storage {
	t.Helper()
	t.Chdir(t.TempDir())

	s := NewStorage()
	if err := s.Init("test.bolt"); err != nil {
		t.Fatalf("init storage: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

// Records written before timestamps were normalized keep whatever zone their
// Date header carried, and storm's OrderBy compares a time.Time by its
// marshalled RFC 3339 *text* — clock face first, zone offset never. Ordering on
// Id (capture order) is what makes such a mailbox list correctly; ordering on
// Date interleaves it by the UTC offset.
func TestListingOrderIgnoresDateHeaderZone(t *testing.T) {
	s := openTemp(t)

	prague := time.FixedZone("CEST", 2*60*60)
	newYork := time.FixedZone("EDT", -4*60*60)

	// Captured in this order; the Date headers disagree about zone, and their
	// clock faces run *backwards* relative to the true instants.
	captured := []struct {
		id      string
		subject string
		date    time.Time
	}{
		{"1785844765100000000-aaa", "oldest", time.Date(2026, 8, 4, 15, 0, 0, 0, prague)}, // 13:00Z
		{"1785844765200000000-bbb", "middle", time.Date(2026, 8, 4, 13, 30, 0, 0, time.UTC)},
		{"1785844765300000000-ccc", "newest", time.Date(2026, 8, 4, 10, 15, 0, 0, newYork)}, // 14:15Z
	}
	for _, c := range captured {
		err := s.SaveMessage(&types.MailData{
			Id:      c.id,
			Subject: c.subject,
			To:      []string{"z@example.com"},
			Date:    c.date,
			Parts:   []*types.PartData{{MediaType: "text/plain", Data: "body"}},
		})
		if err != nil {
			t.Fatalf("save %s: %v", c.subject, err)
		}
	}

	want := []string{"newest", "middle", "oldest"}

	messages, total, err := s.LoadMessages(1, 50)
	if err != nil {
		t.Fatalf("load messages: %v", err)
	}
	if total != 3 {
		t.Errorf("total = %d, want 3", total)
	}
	if got := subjects(messages); !equal(got, want) {
		t.Errorf("LoadMessages order = %v, want %v", got, want)
	}

	found, err := s.SearchMessages(types.SearchFilter{Q: "z@example.com"})
	if err != nil {
		t.Fatalf("search messages: %v", err)
	}
	if got := subjects(found); !equal(got, want) {
		t.Errorf("SearchMessages order = %v, want %v", got, want)
	}
}

// Two messages captured within the same second: one Date carries nanoseconds
// (maildebug's fallback for a missing header), the other does not. Their RFC
// 3339 text compares '.' against 'Z', which inverts them.
func TestListingOrderWithinOneSecond(t *testing.T) {
	s := openTemp(t)

	base := time.Date(2026, 8, 4, 13, 59, 25, 0, time.UTC)
	saves := []struct {
		id      string
		subject string
		date    time.Time
	}{
		{"1785844765400000000-ddd", "whole-second", base},
		{"1785844765500000000-eee", "sub-second", base.Add(123456789 * time.Nanosecond)},
	}
	for _, c := range saves {
		if err := s.SaveMessage(&types.MailData{Id: c.id, Subject: c.subject, Date: c.date}); err != nil {
			t.Fatalf("save %s: %v", c.subject, err)
		}
	}

	messages, _, err := s.LoadMessages(1, 50)
	if err != nil {
		t.Fatalf("load messages: %v", err)
	}
	want := []string{"sub-second", "whole-second"}
	if got := subjects(messages); !equal(got, want) {
		t.Errorf("LoadMessages order = %v, want %v", got, want)
	}
}

func subjects(messages []*types.MailData) []string {
	out := make([]string, 0, len(messages))
	for _, m := range messages {
		out = append(out, m.Subject)
	}
	return out
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
