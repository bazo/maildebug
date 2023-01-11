package api

import (
	"encoding/json"
	"log"
	"mail-debug/storage"
	"net/http"
)

type Api struct {
	storage *storage.Storage
}

func NewApi(storage *storage.Storage) *Api {
	return &Api{
		storage,
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
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(err)
}
