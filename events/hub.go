// Package events provides a tiny in-process pub/sub hub used to push
// new-message notifications to connected UI clients over Server-Sent Events.
package events

import "sync"

// Event is a single notification pushed to subscribers. Currently only
// new-message events are emitted (Type "message").
type Event struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	From    string `json:"from"`
	Subject string `json:"subject"`
	Date    string `json:"date"`
}

// Hub fans a published Event out to every current subscriber. Safe for
// concurrent use.
type Hub struct {
	mu   sync.Mutex
	subs map[chan Event]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: make(map[chan Event]struct{})}
}

// Subscribe registers a new subscriber and returns its buffered channel.
func (h *Hub) Subscribe() chan Event {
	ch := make(chan Event, 16)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes a subscriber and closes its channel. Idempotent.
func (h *Hub) Unsubscribe(ch chan Event) {
	h.mu.Lock()
	if _, ok := h.subs[ch]; ok {
		delete(h.subs, ch)
		close(ch)
	}
	h.mu.Unlock()
}

// Publish delivers e to all subscribers. A subscriber whose buffer is full is
// skipped rather than blocking ingest — the UI refetches on the next event, so
// a dropped notification only delays a refresh, never loses data.
func (h *Hub) Publish(e Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- e:
		default:
		}
	}
}
