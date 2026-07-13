package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"maildebug/check"

	"github.com/asdine/storm"
	"github.com/uptrace/bunrouter"
)

// idParam extracts and loads the message named by :id, writing an error
// response and returning ok=false on failure.
func (api *Api) messageFromParam(w http.ResponseWriter, r *http.Request) (id string, ok bool) {
	id, ok = bunrouter.ParamsFromContext(r.Context()).Get("id")
	if !ok {
		createErrorResponse(w, fmt.Errorf("id not provided"), http.StatusBadRequest)
		return "", false
	}
	return id, true
}

// ChecksHandler runs the cheap, no-network checks (currently List-Unsubscribe).
func (api *Api) ChecksHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := api.messageFromParam(w, r)
	if !ok {
		return
	}
	message, err := api.storage.LoadMessage(id)
	if err != nil {
		if errors.Is(err, storm.ErrNotFound) {
			createErrorResponse(w, fmt.Errorf("message %s not found", id), http.StatusNotFound)
			return
		}
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}
	var htmlBody string
	for _, p := range message.Parts {
		if p.MediaType == "text/html" {
			htmlBody = p.Data
			break
		}
	}
	createResponse(w, check.Run(message.RawHeaders, htmlBody), http.StatusOK)
}

// LinkCheckHandler extracts links from the message bodies and probes each. It
// makes external HTTP requests, so it is a deliberate, on-demand trigger.
func (api *Api) LinkCheckHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := api.messageFromParam(w, r)
	if !ok {
		return
	}
	message, err := api.storage.LoadMessage(id)
	if err != nil {
		if errors.Is(err, storm.ErrNotFound) {
			createErrorResponse(w, fmt.Errorf("message %s not found", id), http.StatusNotFound)
			return
		}
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	var htmlBody, textBody string
	for _, p := range message.Parts {
		switch p.MediaType {
		case "text/html":
			htmlBody = p.Data
		case "text/plain":
			textBody = p.Data
		}
	}

	links := check.ExtractLinks(htmlBody, textBody)
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	client := &http.Client{Timeout: 10 * time.Second}
	result := check.CheckLinks(ctx, client, links, 8)
	createResponse(w, result, http.StatusOK)
}

// SpamCheckHandler scores the raw message via a configured SpamAssassin daemon.
// Returns 409 when no daemon is configured so the UI can hide the panel.
func (api *Api) SpamCheckHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := api.messageFromParam(w, r)
	if !ok {
		return
	}
	if api.spamAddr == "" {
		createErrorResponse(w, fmt.Errorf("spam checking not configured (set MAILDEBUG_SPAMASSASSIN)"), http.StatusConflict)
		return
	}

	raw, err := os.ReadFile("data/messages/" + id)
	if err != nil {
		if os.IsNotExist(err) {
			createErrorResponse(w, fmt.Errorf("message %s not found", id), http.StatusNotFound)
			return
		}
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	result, err := check.SpamCheck(api.spamAddr, raw)
	if err != nil {
		createErrorResponse(w, err, http.StatusBadGateway)
		return
	}
	createResponse(w, result, http.StatusOK)
}
