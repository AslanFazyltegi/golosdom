package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	HTTPPort string
	DBUrl    string
}

func Load() Config {
	_ = godotenv.Load()

	port := os.Getenv("HTTP_PORT")
	if port == "" {
		port = "8080"
	}

	if port[0] != ':' {
		port = ":" + port
	}

	dbHost := mustEnv("DB_HOST")
	dbPort := mustEnv("DB_PORT")
	dbUser := mustEnv("DB_USER")
	dbPassword := mustEnv("DB_PASSWORD")
	dbName := mustEnv("DB_NAME")
	dbSSLMode := mustEnv("DB_SSLMODE")

	dbURL := "postgres://" + dbUser + ":" + dbPassword + "@" + dbHost + ":" + dbPort + "/" + dbName + "?sslmode=" + dbSSLMode

	return Config{
		HTTPPort: port,
		DBUrl:    dbURL,
	}
}

func mustEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		panic("missing required env: " + key)
	}
	return value
}
