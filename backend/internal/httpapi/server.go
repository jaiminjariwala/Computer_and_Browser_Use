package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/ai"
	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/auth"
	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/billing"
	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/domain"
	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/store"
)

type GitHubVerifier interface {
	Verify(context.Context, string) (domain.User, error)
}

type SessionManager interface {
	Issue(string, time.Duration) (string, error)
	Verify(string) (auth.Claims, error)
}

type AIRouter interface {
	Available() bool
	Complete(context.Context, ai.Request) (ai.Result, error)
}

type StripeBilling interface {
	Ready() bool
	CreateCheckout(context.Context, string, string) (billing.Checkout, error)
	CreatePortal(context.Context, string) (billing.Checkout, error)
	VerifyEvent([]byte, string) (billing.Event, error)
}

type Config struct {
	PublicAppURL     string
	FreeMonthlyUnits int64
	PlusMonthlyUnits int64
}

type Server struct {
	config   Config
	github   GitHubVerifier
	sessions SessionManager
	store    store.Store
	ai       AIRouter
	stripe   StripeBilling
	logger   *slog.Logger
	handler  http.Handler
}

type contextKey string

const userContextKey contextKey = "authenticated-user"

func New(config Config, github GitHubVerifier, sessions SessionManager, data store.Store, router AIRouter, stripe StripeBilling, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	server := &Server{config: config, github: github, sessions: sessions, store: data, ai: router, stripe: stripe, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", server.health)
	mux.HandleFunc("POST /v1/auth/github", server.githubExchange)
	mux.Handle("GET /v1/me", server.authenticate(http.HandlerFunc(server.me)))
	mux.Handle("GET /v1/usage", server.authenticate(http.HandlerFunc(server.usage)))
	mux.Handle("POST /v1/chat", server.authenticate(http.HandlerFunc(server.chat)))
	mux.Handle("POST /v1/chat/completions", server.authenticate(http.HandlerFunc(server.chatCompletions)))
	mux.Handle("POST /v1/billing/checkout", server.authenticate(http.HandlerFunc(server.checkout)))
	mux.Handle("POST /v1/billing/portal", server.authenticate(http.HandlerFunc(server.portal)))
	mux.HandleFunc("POST /v1/webhooks/stripe", server.stripeWebhook)
	server.handler = server.recoverPanic(server.cors(mux))
	return server
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.handler.ServeHTTP(w, r) }

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "ai_configured": s.ai.Available(), "stripe_configured": s.stripe.Ready(),
	})
}

func (s *Server) githubExchange(w http.ResponseWriter, r *http.Request) {
	var input struct {
		AccessToken string `json:"access_token"`
	}
	if err := decodeJSON(w, r, &input, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	profile, err := s.github.Verify(r.Context(), input.AccessToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "GitHub sign-in could not be verified")
		return
	}
	user, err := s.store.UpsertGitHubUser(profile)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create the app account")
		return
	}
	const sessionTTL = 30 * 24 * time.Hour
	token, err := s.sessions.Issue(user.ID, sessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create a session")
		return
	}
	usage, _ := s.currentUsage(user, time.Now())
	writeJSON(w, http.StatusOK, map[string]any{
		"session_token": token,
		"expires_at":    time.Now().UTC().Add(sessionTTL),
		"user":          user,
		"usage":         usage,
	})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r.Context())
	usage, err := s.currentUsage(user, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load usage")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "usage": usage})
}

func (s *Server) usage(w http.ResponseWriter, r *http.Request) {
	usage, err := s.currentUsage(currentUser(r.Context()), time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load usage")
		return
	}
	writeJSON(w, http.StatusOK, usage)
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r.Context())
	var input ai.Request
	if err := decodeJSON(w, r, &input, 20<<20); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateMessages(input.Messages); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	result, usage, status, message := s.complete(r.Context(), user, input)
	if status != http.StatusOK {
		writeError(w, status, message)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"response": result, "usage": usage})
}

func (s *Server) chatCompletions(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r.Context())
	var input ai.Request
	if err := decodeJSON(w, r, &input, 20<<20); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateMessages(input.Messages); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	result, usage, status, message := s.complete(r.Context(), user, input)
	if status != http.StatusOK {
		writeError(w, status, message)
		return
	}
	w.Header().Set("X-Managed-AI-Provider", result.Provider)
	w.Header().Set("X-Managed-Usage-Remaining", fmt.Sprintf("%d", usage.RemainingUnits))
	writeJSON(w, http.StatusOK, map[string]any{
		"id":     "managed-" + user.ID,
		"object": "chat.completion",
		"model":  result.Model,
		"choices": []map[string]any{{
			"index":         0,
			"message":       map[string]string{"role": "assistant", "content": result.Text},
			"finish_reason": "stop",
		}},
		"usage": map[string]int64{
			"prompt_tokens":     result.Usage.InputTokens,
			"completion_tokens": result.Usage.OutputTokens,
			"total_tokens":      result.Usage.TotalTokens,
		},
	})
}

func (s *Server) complete(ctx context.Context, user domain.User, input ai.Request) (ai.Result, domain.Usage, int, string) {
	usage, err := s.currentUsage(user, time.Now())
	if err != nil {
		return ai.Result{}, domain.Usage{}, http.StatusInternalServerError, "Could not load usage"
	}
	if usage.RemainingUnits <= 0 {
		return ai.Result{}, usage, http.StatusTooManyRequests, "Monthly usage limit reached"
	}
	result, err := s.ai.Complete(ctx, input)
	if err != nil {
		s.logger.Error("managed AI request failed", "user_id", user.ID, "error", err)
		return ai.Result{}, usage, http.StatusServiceUnavailable, "The AI service is temporarily unavailable"
	}
	units := result.Usage.TotalTokens
	if units <= 0 {
		units = estimateUnits(input.Messages, result.Text)
	}
	usage, err = s.store.ChargeUsage(user.ID, units, usage.LimitUnits, time.Now())
	if err != nil {
		return ai.Result{}, usage, http.StatusTooManyRequests, "Monthly usage limit reached"
	}
	return result, usage, http.StatusOK, ""
}

func (s *Server) checkout(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r.Context())
	checkout, err := s.stripe.CreateCheckout(r.Context(), user.ID, user.Email)
	if err != nil {
		s.logger.Error("stripe checkout creation failed", "user_id", user.ID, "error", err)
		writeError(w, http.StatusServiceUnavailable, "Checkout is not available yet")
		return
	}
	writeJSON(w, http.StatusOK, checkout)
}

func (s *Server) portal(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r.Context())
	portal, err := s.stripe.CreatePortal(r.Context(), user.StripeCustomerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "No billing account is available")
		return
	}
	writeJSON(w, http.StatusOK, portal)
}

func (s *Server) stripeWebhook(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid webhook body")
		return
	}
	event, err := s.stripe.VerifyEvent(payload, r.Header.Get("Stripe-Signature"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid webhook signature")
		return
	}
	processed, err := s.store.EventProcessed(event.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not process webhook")
		return
	}
	if processed {
		writeJSON(w, http.StatusOK, map[string]bool{"received": true})
		return
	}
	if err := s.applyStripeEvent(event); err != nil {
		s.logger.Error("stripe event application failed", "event_id", event.ID, "event_type", event.Type, "error", err)
		writeError(w, http.StatusInternalServerError, "Could not apply webhook")
		return
	}
	if err := s.store.MarkEventProcessed(event.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not finish webhook")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"received": true})
}

func (s *Server) applyStripeEvent(event billing.Event) error {
	switch event.Type {
	case "checkout.session.completed":
		var object struct {
			ClientReferenceID string `json:"client_reference_id"`
			Customer          string `json:"customer"`
			Subscription      string `json:"subscription"`
		}
		if err := json.Unmarshal(event.Data.Object, &object); err != nil || object.ClientReferenceID == "" {
			return errors.New("checkout session has no app user")
		}
		return s.store.SetStripeSubscription(object.ClientReferenceID, object.Customer, object.Subscription, "active", domain.PlanPlus)
	case "invoice.paid":
		return s.setPlanByCustomer(event.Data.Object, "active", domain.PlanPlus)
	case "invoice.payment_failed":
		return s.setPlanByCustomer(event.Data.Object, "past_due", domain.PlanFree)
	case "customer.subscription.updated":
		var object struct {
			Customer string `json:"customer"`
			ID       string `json:"id"`
			Status   string `json:"status"`
		}
		if err := json.Unmarshal(event.Data.Object, &object); err != nil {
			return err
		}
		plan := domain.PlanFree
		if object.Status == "active" || object.Status == "trialing" {
			plan = domain.PlanPlus
		}
		user, err := s.store.UserByStripeCustomer(object.Customer)
		if err != nil {
			return err
		}
		return s.store.SetStripeSubscription(user.ID, object.Customer, object.ID, object.Status, plan)
	case "customer.subscription.deleted":
		return s.setPlanByCustomer(event.Data.Object, "canceled", domain.PlanFree)
	default:
		return nil
	}
}

func (s *Server) setPlanByCustomer(raw json.RawMessage, status string, plan domain.Plan) error {
	var object struct {
		Customer     string `json:"customer"`
		Subscription string `json:"subscription"`
		ID           string `json:"id"`
	}
	if err := json.Unmarshal(raw, &object); err != nil || object.Customer == "" {
		return errors.New("stripe event has no customer")
	}
	user, err := s.store.UserByStripeCustomer(object.Customer)
	if err != nil {
		return err
	}
	subscriptionID := object.Subscription
	if subscriptionID == "" {
		subscriptionID = object.ID
	}
	return s.store.SetStripeSubscription(user.ID, object.Customer, subscriptionID, status, plan)
}

func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := auth.Bearer(r.Header.Get("Authorization"))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Sign in is required")
			return
		}
		claims, err := s.sessions.Verify(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Session is invalid or expired")
			return
		}
		user, err := s.store.UserByID(claims.Subject)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Account was not found")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey, user)))
	})
}

func (s *Server) currentUsage(user domain.User, now time.Time) (domain.Usage, error) {
	return s.store.Usage(user.ID, s.config.FreeMonthlyUnits, s.config.PlusMonthlyUnits, now)
}

func currentUser(ctx context.Context) domain.User {
	user, _ := ctx.Value(userContextKey).(domain.User)
	return user
}

func validateMessages(messages []ai.Message) error {
	if len(messages) == 0 || len(messages) > 64 {
		return errors.New("messages must contain between 1 and 64 entries")
	}
	total := 0
	for _, message := range messages {
		if message.Role != "system" && message.Role != "user" && message.Role != "assistant" {
			return errors.New("message role is invalid")
		}
		characters, valid := messageContentSize(message.Content)
		if !valid {
			return errors.New("message content cannot be empty")
		}
		total += characters
	}
	if total > 500_000 {
		return errors.New("message content is too large")
	}
	return nil
}

func estimateUnits(messages []ai.Message, output string) int64 {
	characters := len(output)
	for _, message := range messages {
		size, _ := messageContentSize(message.Content)
		characters += size
	}
	units := int64(characters / 4)
	if units < 1 {
		return 1
	}
	return units
}

func messageContentSize(content any) (int, bool) {
	switch value := content.(type) {
	case string:
		return len(value), strings.TrimSpace(value) != ""
	case []any:
		total := 0
		valid := false
		for _, item := range value {
			part, ok := item.(map[string]any)
			if !ok {
				continue
			}
			typeName, _ := part["type"].(string)
			switch typeName {
			case "text":
				text, _ := part["text"].(string)
				total += len(text)
				valid = valid || strings.TrimSpace(text) != ""
			case "image_url", "input_audio":
				// Media is already bounded by the HTTP body limit. Count a small
				// fixed amount for fallback usage estimation instead of charging
				// for base64 bytes.
				total += 256
				valid = true
			}
		}
		return total, valid
	default:
		return 0, false
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any, limit int64) error {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errors.New("Invalid JSON request")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && origin == s.config.PublicAppURL {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Stripe-Signature")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("request panic", "error", recovered)
				writeError(w, http.StatusInternalServerError, "Internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
