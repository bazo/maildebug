package api

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"maildebug/types"
	"math"
	"mime"
	"net/http"
	"os"
	"strconv"

	"github.com/asdine/storm"
	"github.com/uptrace/bunrouter"
)

// paginate returns the page-th slice (1-based) of size limit from msgs.
func paginate(msgs []*types.MailData, page, limit int64) []*types.MailData {
	if limit <= 0 {
		return msgs
	}
	start := (page - 1) * limit
	if start < 0 || start >= int64(len(msgs)) {
		return []*types.MailData{}
	}
	end := start + limit
	if end > int64(len(msgs)) {
		end = int64(len(msgs))
	}
	return msgs[start:end]
}

func (api *Api) LoadMessagesHandler(w http.ResponseWriter, r *http.Request) {

	page, err := strconv.ParseInt(r.URL.Query().Get("page"), 10, 64)

	if err != nil {
		page = 1
	} else {
		if page < 1 {
			page = 1
		}
	}

	limit, err := strconv.ParseInt(r.URL.Query().Get("maxPerPage"), 10, 64)

	if err != nil {
		limit = 50
	} else {
		if limit < 0 {
			limit = 50
		}
	}

	q := r.URL.Query()
	filter := types.SearchFilter{
		Q:       q.Get("search"),
		To:      q.Get("to"),
		From:    q.Get("from"),
		Subject: q.Get("subject"),
		Body:    q.Get("body"),
	}

	var (
		messages []*types.MailData
		total    int64
	)
	if filter.IsZero() {
		messages, total, err = api.storage.LoadMessages(page, limit)
	} else {
		// Search matches across the whole mailbox, then paginate the result.
		var matched []*types.MailData
		matched, err = api.storage.SearchMessages(filter)
		total = int64(len(matched))
		messages = paginate(matched, page, limit)
	}

	if err != nil {
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	var pagesCount int64

	x := float64(total) / float64(limit)

	pagesCount = int64(math.Ceil(x))

	unread, err := api.storage.UnreadCount()
	if err != nil {
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	responseMessages := make([]*types.MailDataResponse, 0, len(messages))

	for _, message := range messages {
		responseMessages = append(responseMessages, types.NewMailDataResponse(message))
	}

	response := types.ApiResponse{
		Page:       page,
		PagesCount: pagesCount,
		Unread:     unread,
		Messages:   responseMessages,
	}

	createResponse(w, response, http.StatusOK)
}

// MarkReadHandler flags a single message as read.
func (api *Api) MarkReadHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := bunrouter.ParamsFromContext(r.Context()).Get("id")
	if !ok {
		createErrorResponse(w, fmt.Errorf("id not provided"), http.StatusBadRequest)
		return
	}

	if err := api.storage.MarkRead(id); err != nil {
		if errors.Is(err, storm.ErrNotFound) {
			createErrorResponse(w, fmt.Errorf("message %s not found", id), http.StatusNotFound)
			return
		}
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Access-Control-Allow-Methods", "*")
	createResponse(w, types.ApiResponse{}, http.StatusOK)
}

func (api *Api) LoadMessagesAttachment(w http.ResponseWriter, r *http.Request) {
	params := bunrouter.ParamsFromContext(r.Context())

	id, ok := params.Get("id")

	if !ok {
		createErrorResponse(w, fmt.Errorf("id not provided"), http.StatusBadRequest)
		return
	}

	index, ok := params.Get("index")

	if !ok {
		createErrorResponse(w, fmt.Errorf("index not provided"), http.StatusBadRequest)
		return
	}

	i, err := strconv.ParseInt(index, 10, 0)

	if err != nil {
		createErrorResponse(w, err, http.StatusBadRequest)
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

	if i < 0 || int(i) >= len(message.Attachments) {
		createErrorResponse(w, fmt.Errorf("attachment index %d out of range (have %d)", i, len(message.Attachments)), http.StatusBadRequest)
		return
	}

	attachment := message.Attachments[i]

	// attachment.Data already holds the decoded bytes (session.decodePart
	// decodes base64/quoted-printable at ingest time), so serve it as-is —
	// decoding again here corrupts binary content and 500s on non-base64 bytes.
	//
	// FormatMediaType quotes/encodes the filename so names with spaces or
	// special characters aren't mangled by browsers.
	//
	// Inline parts (the images an HTML body pulls in via cid:) are served with
	// an inline disposition so opening one directly renders it instead of
	// downloading it.
	disposition := "attachment"
	if attachment.Inline {
		disposition = "inline"
	}

	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": attachment.Name}))
	w.Header().Set("Content-Type", attachment.MediaType)
	io.Copy(w, bytes.NewReader(attachment.Data))
}

// LoadMessageHandler returns a single message with full parts/headers. Like
// LoadMessages it serves a MailDataResponse, which omits the heavy decoded
// attachment bytes (fetched separately via the attachment endpoint).
func (api *Api) LoadMessageHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := bunrouter.ParamsFromContext(r.Context()).Get("id")
	if !ok {
		createErrorResponse(w, fmt.Errorf("id not provided"), http.StatusBadRequest)
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

	createResponse(w, types.NewMailDataResponse(message), http.StatusOK)
}

// DeleteMessageHandler deletes one message by id.
func (api *Api) DeleteMessageHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := bunrouter.ParamsFromContext(r.Context()).Get("id")
	if !ok {
		createErrorResponse(w, fmt.Errorf("id not provided"), http.StatusBadRequest)
		return
	}

	if err := api.storage.DeleteMessage(id); err != nil {
		if errors.Is(err, storm.ErrNotFound) {
			createErrorResponse(w, fmt.Errorf("message %s not found", id), http.StatusNotFound)
			return
		}
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Access-Control-Allow-Methods", "*")
	createResponse(w, types.ApiResponse{}, http.StatusOK)
}

// RawMessageHandler streams the original RFC 822 bytes stored on disk. With
// ?download=1 it sets an attachment disposition so browsers save a .eml file.
func (api *Api) RawMessageHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := bunrouter.ParamsFromContext(r.Context()).Get("id")
	if !ok {
		createErrorResponse(w, fmt.Errorf("id not provided"), http.StatusBadRequest)
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

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "message/rfc822")
	if r.URL.Query().Has("download") {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": id + ".eml"}))
	}
	w.Write(raw)
}

func (api *Api) DeleteMessagesHandler(w http.ResponseWriter, r *http.Request) {

	err := api.storage.DeleteMessages()

	if err != nil {
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	response := types.ApiResponse{}
	w.Header().Set("Access-Control-Allow-Methods", "*")
	createResponse(w, response, http.StatusOK)
}
