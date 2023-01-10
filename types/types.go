package types

type Config struct {
	SMTPPort string `default:"1025"`
	Username string `default:"username"`
	Password string `default:"password"`

	APIPort string `default:"8100"`
	DbName  string `default:"mail.bolt"`

	Domain       string `default:"localhost"`
	ReadTimeout  int    `default:"10"`
	WriteTimeout int    `default:"10"`
	//1024 * 1024
	MaxMessageBytes   int  `default:"1048576"`
	MaxRecipients     int  `default:"50"`
	AllowInsecureAuth bool `default:"true"`
}
