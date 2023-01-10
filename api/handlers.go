package api

import (
	"mail-debug/types"
	"math"
	"net/http"
	"strconv"
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
