package main

import (
	"flag"
	"log"
	"maildebug/api"
	"maildebug/session"
	"maildebug/storage"
	"maildebug/types"
	"net/http"
	"time"

	rice "github.com/GeertJohan/go.rice"
	"github.com/emersion/go-smtp"
	"github.com/jinzhu/configor"
	"github.com/uptrace/bunrouter"
	"github.com/uptrace/bunrouter/extra/reqlog"
)

var config types.Config

func loadConfig() {
	configFile := flag.String("file", "maildebug.yml", "configuration file")
	configor.New(&configor.Config{ENVPrefix: "MAILDEBUG"}).Load(&config, *configFile)
}

func main() {
	loadConfig()

	storage := storage.NewStorage()

	api := api.NewApi(storage)

	defer storage.Close()
	err := storage.Init(config.DbName)

	if err != nil {
		log.Fatal("Opening db: ", err)
	}

	s := smtp.NewServer(session.NewBackend(config.Username, config.Password, func(data *types.MailData) error {
		storage.SaveMessage(data)
		log.Println("message saved", data.MessageId)
		return nil
	}))

	s.Addr = ":" + config.SMTPPort
	s.Domain = config.Domain
	s.ReadTimeout = time.Duration(config.ReadTimeout) * time.Second
	s.WriteTimeout = time.Duration(config.WriteTimeout) * time.Second
	s.MaxMessageBytes = config.MaxMessageBytes
	s.MaxRecipients = config.MaxRecipients
	s.AllowInsecureAuth = config.AllowInsecureAuth

	router := bunrouter.New(
		bunrouter.Use(reqlog.NewMiddleware(
			reqlog.FromEnv("BUNDEBUG"),
		)),
	).Compat()

	box, err := rice.FindBox("ui/dist")

	if err != nil {
		log.Fatalln("ui/dist folder not found")
	}

	httpBox := box.HTTPBox()
	fileServer := http.FileServer(httpBox)

	router.GET("/assets/*path", func(w http.ResponseWriter, r *http.Request) {
		log.Println(r.URL.Path)

		http.StripPrefix("/", fileServer).ServeHTTP(w, r)
	})

	router.GET("/", func(w http.ResponseWriter, r *http.Request) {
		http.StripPrefix("/", fileServer).ServeHTTP(w, r)
	})

	router.GET("/messages", api.LoadMessagesHandler)
	router.GET("/messages/:id/attachments/:index", api.LoadMessagesAttachment)

	go listenSmtp(s)

	log.Println("Starting API server at", config.APIPort)
	http.ListenAndServe(":"+config.APIPort, router)
}

func listenSmtp(s *smtp.Server) {
	log.Println("Starting SMTP server at", s.Addr)
	if err := s.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
