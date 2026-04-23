package config

import "os"

type Config struct {
	HTTPPort string
}

func Load() Config {
	port := os.Getenv("HTTP_PORT")
	if port == "" {
		port = ":8080"
	}

	if port[0] != ':' {
		port = ":" + port
	}

	return Config{
		HTTPPort: port,
	}
}