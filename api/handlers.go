package api

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mail-debug/types"
	"math"
	"net/http"
	"strconv"

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
		createErrorResponse(w, err, http.StatusBadRequest)
		return
	}

	if message == nil {
		createErrorResponse(w, err, http.StatusNotFound)
		return
	}

	attachment := message.Attachments[i]

	//createResponse(w, attachment, http.StatusOK)

	b, err := base64.StdEncoding.DecodeString(attachment.Data)
	if err != nil {
		createErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Disposition", "attachment; filename="+attachment.Name)
	w.Header().Set("Content-Type", attachment.MediaType)
	io.Copy(w, bytes.NewReader(b))
}
