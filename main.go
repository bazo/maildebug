package main

import (
	"flag"
	"log"
	"mail-debug/session"
	"mail-debug/storage"
	"mail-debug/types"
	"time"

	"github.com/emersion/go-smtp"
	"github.com/jinzhu/configor"
)

var config types.Config

func loadConfig() {
	configFile := flag.String("file", "maildebug.yml", "configuration file")
	configor.Load(&config, *configFile)
}

func main() {
	loadConfig()

	storage := storage.NewStorage()

	log.Println(storage)

	defer storage.Close()
	err := storage.Init(config.DbName)

	if err != nil {
		log.Fatal("Opening db: ", err)
	}

	s := smtp.NewServer(session.NewBackend(config.Username, config.Password, func(data *types.MailData) error {
		storage.SaveMessage(data)
		return nil
	}))

	s.Addr = ":" + config.SMTPPort
	s.Domain = config.Domain
	s.ReadTimeout = time.Duration(config.ReadTimeout) * time.Second
	s.WriteTimeout = time.Duration(config.WriteTimeout) * time.Second
	s.MaxMessageBytes = config.MaxMessageBytes
	s.MaxRecipients = config.MaxRecipients
	s.AllowInsecureAuth = config.AllowInsecureAuth

	log.Println("Starting server at", s.Addr)
	if err := s.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
