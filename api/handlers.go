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
	"strconv"

	"github.com/asdine/storm"
	"github.com/uptrace/bunrouter"
)

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

	messages, total, err := api.storage.LoadMessages(page, limit)

	if err != nil {
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	var pagesCount int64

	x := float64(total) / float64(limit)

	pagesCount = int64(math.Ceil(x))

	response := types.ApiResponse{
		Page:       page,
		PagesCount: pagesCount,
		Messages:   messages,
	}

	createResponse(w, response, http.StatusOK)
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
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": attachment.Name}))
	w.Header().Set("Content-Type", attachment.MediaType)
	io.Copy(w, bytes.NewReader(attachment.Data))
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
