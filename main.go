package main

import (
	"bytes"
	"embed"
	"io/fs"
	"log"
	"maildebug/api"
	"maildebug/session"
	"maildebug/storage"
	"maildebug/types"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/emersion/go-smtp"
	"github.com/joho/godotenv"
	"github.com/uptrace/bunrouter"
	"github.com/uptrace/bunrouter/extra/reqlog"
)

const envPrefix = "MAILDEBUG_"

//go:embed ui/dist
var embeddedFiles embed.FS

var config types.Config

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(envPrefix + key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(envPrefix + key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envInt64(key string, fallback int64) int64 {
	if v := os.Getenv(envPrefix + key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if v := os.Getenv(envPrefix + key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func loadConfig() {
	appEnv := envOrDefault("ENV", "development")

	// Load in priority order: godotenv won't overwrite existing keys,
	// so higher-priority files must come first.
	envFiles := []string{
		"maildebug.env." + appEnv + ".local",
		"maildebug.env.local",
		"maildebug.env." + appEnv,
		"maildebug.env",
		".env." + appEnv + ".local",
		".env.local",
		".env." + appEnv,
		".env",
	}

	var filesToLoad []string
	for _, f := range envFiles {
		if _, err := os.Stat(f); err == nil {
			filesToLoad = append(filesToLoad, f)
		}
	}
	if len(filesToLoad) > 0 {
		godotenv.Load(filesToLoad...)
	}

	config = types.Config{
		SMTPPort:          envOrDefault("SMTP_PORT", "1025"),
		Username:          envOrDefault("USERNAME", "username"),
		Password:          envOrDefault("PASSWORD", "password"),
		APIPort:           envOrDefault("API_PORT", "8100"),
		DbName:            envOrDefault("DB_NAME", "mail.bolt"),
		Domain:            envOrDefault("DOMAIN", "localhost"),
		ReadTimeout:       envInt("READ_TIMEOUT", 10),
		WriteTimeout:      envInt("WRITE_TIMEOUT", 10),
		MaxMessageBytes:   envInt64("MAX_MESSAGE_BYTES", 1048576),
		MaxRecipients:     envInt("MAX_RECIPIENTS", 50),
		AllowInsecureAuth: envBool("ALLOW_INSECURE_AUTH", true),
	}
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

	s := smtp.NewServer(session.NewBackend(config.Username, config.Password, func(data *types.MailData, b bytes.Buffer) error {
		os.WriteFile("data/messages/"+data.Id, b.Bytes(), os.ModePerm)
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

	distFS, err := fs.Sub(embeddedFiles, "ui/dist")
	if err != nil {
		log.Fatal("Embedding ui/dist: ", err)
	}

	fileServer := http.FileServer(http.FS(distFS))

	router.GET("/assets/*path", func(w http.ResponseWriter, r *http.Request) {
		http.StripPrefix("/", fileServer).ServeHTTP(w, r)
	})

	router.GET("/", func(w http.ResponseWriter, r *http.Request) {
		http.StripPrefix("/", fileServer).ServeHTTP(w, r)
	})

	router.OPTIONS("/*p", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "*")
		w.WriteHeader(http.StatusOK)
	})

	router.GET("/messages", api.LoadMessagesHandler)
	router.GET("/messages/:id/attachments/:index", api.LoadMessagesAttachment)
	router.DELETE("/messages", api.DeleteMessagesHandler)

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
