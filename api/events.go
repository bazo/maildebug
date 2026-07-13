package api

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// EventsHandler streams new-message notifications to the UI over Server-Sent
// Events. It relies on the underlying ResponseWriter implementing http.Flusher;
// the reqlog middleware wraps via httpsnoop, which preserves that interface.
func (api *Api) EventsHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		createErrorResponse(w, fmt.Errorf("streaming unsupported"), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := api.hub.Subscribe()
	defer api.hub.Unsubscribe(ch)

	// Prime the stream so the client's onopen fires promptly and proxies flush.
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case e, ok := <-ch:
			if !ok {
				return
			}
			payload, err := json.Marshal(e)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "data: %s\n\n", payload)
			flusher.Flush()
		}
	}
}
