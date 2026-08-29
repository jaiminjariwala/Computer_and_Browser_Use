package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                  string
	DatabaseURL           string
	PublicAppURL          string
	SessionSecret         string
	GeminiAPIKey          string
	GeminiModel           string
	OpenRouterAPIKey      string
	OpenRouterModel       string
	OpenAIAPIKey          string
	OpenAICodexModel      string
	FreeMonthlyUnits      int64
	PlusMonthlyUnits      int64
	StripeSecretKey       string
	StripeWebhookSecret   string
	StripePlusPriceID     string
	StripeSuccessURL      string
	StripeCancelURL       string
	StripePortalReturnURL string
}

func Load() (Config, error) {
	cfg := Config{
		Port:                  env("PORT", "8787"),
		DatabaseURL:           strings.TrimSpace(os.Getenv("DATABASE_URL")),
		PublicAppURL:          env("PUBLIC_APP_URL", "http://localhost:5173"),
		SessionSecret:         strings.TrimSpace(os.Getenv("SESSION_SECRET")),
		GeminiAPIKey:          strings.TrimSpace(os.Getenv("GEMINI_API_KEY")),
		GeminiModel:           env("GEMINI_MODEL", "gemini-2.5-flash"),
		OpenRouterAPIKey:      strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY")),
		OpenRouterModel:       env("OPENROUTER_MODEL", "openrouter/free"),
		OpenAIAPIKey:          strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		OpenAICodexModel:      env("OPENAI_CODEX_MODEL", "gpt-5-codex"),
		FreeMonthlyUnits:      envInt64("FREE_MONTHLY_UNITS", 50_000),
		PlusMonthlyUnits:      envInt64("PLUS_MONTHLY_UNITS", 2_000_000),
		StripeSecretKey:       strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY")),
		StripeWebhookSecret:   strings.TrimSpace(os.Getenv("STRIPE_WEBHOOK_SECRET")),
		StripePlusPriceID:     strings.TrimSpace(os.Getenv("STRIPE_PLUS_PRICE_ID")),
		StripeSuccessURL:      env("STRIPE_SUCCESS_URL", "http://localhost:5173/billing/success"),
		StripeCancelURL:       env("STRIPE_CANCEL_URL", "http://localhost:5173/billing/cancel"),
		StripePortalReturnURL: env("STRIPE_PORTAL_RETURN_URL", "http://localhost:5173"),
	}
	if len(cfg.SessionSecret) < 32 {
		return Config{}, errors.New("SESSION_SECRET must contain at least 32 characters")
	}
	if cfg.FreeMonthlyUnits <= 0 || cfg.PlusMonthlyUnits <= 0 {
		return Config{}, errors.New("monthly usage limits must be positive")
	}
	return cfg, nil
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envInt64(name string, fallback int64) int64 {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
}
