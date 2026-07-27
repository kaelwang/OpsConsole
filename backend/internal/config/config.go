package config

import "os"

// Config holds all runtime configuration sourced from environment variables.
type Config struct {
	Port               string
	DatabaseURL        string
	RedisURL           string
	JWTSecret          string
	VictoriaMetricsURL string
	VMAlertURL         string
	OpenSearchURL      string
	GitLabBaseURL      string
	GitLabToken        string
	KubeconfigPath     string
}

// Load reads configuration from the environment.
func Load() *Config {
	return &Config{
		Port:               getenv("OPS_PORT", "8080"),
		DatabaseURL:        os.Getenv("OPS_DATABASE_URL"),
		RedisURL:           getenv("OPS_REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:          getenv("OPS_JWT_SECRET", "dev-insecure-secret-change-me"),
		VictoriaMetricsURL: os.Getenv("OPS_VICTORIAMETRICS_URL"),
		VMAlertURL:         os.Getenv("OPS_VMALERT_URL"),
		OpenSearchURL:      os.Getenv("OPS_OPENSEARCH_URL"),
		GitLabBaseURL:      os.Getenv("OPS_GITLAB_BASE_URL"),
		GitLabToken:        os.Getenv("OPS_GITLAB_TOKEN"),
		KubeconfigPath:     getenv("OPS_KUBECONFIG", ""),
	}
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
