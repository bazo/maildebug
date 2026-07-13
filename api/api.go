package api

import (
	"encoding/json"
	"log"
	"maildebug/events"
	"maildebug/storage"
	"net/http"
)

type Api struct {
	storage  *storage.Storage
	hub      *events.Hub
	spamAddr string
}

func NewApi(storage *storage.Storage, hub *events.Hub, spamAddr string) *Api {
	return &Api{
		storage:  storage,
		hub:      hub,
		spamAddr: spamAddr,
	}
}

func createResponse(w http.ResponseWriter, data interface{}, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(data)
}

func createErrorResponse(w http.ResponseWriter, err error, code int) {
	log.Println(err)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(code)
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
