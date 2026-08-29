package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/ai"
	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/auth"
	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/billing"
	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/domain"
	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/store"
)

type githubStub struct{}

func (githubStub) Verify(context.Context, string) (domain.User, error) {
	return domain.User{GitHubID: 42, Login: "jaimin", Name: "Jaimin", Email: "jaimin@example.com"}, nil
}

type aiStub struct{}

func (aiStub) Available() bool { return true }
func (aiStub) Complete(context.Context, ai.Request) (ai.Result, error) {
	return ai.Result{
		Provider: "gemini",
		Model:    "gemini-2.5-flash",
		Text:     "Hello from the managed service.",
		Usage:    ai.TokenUsage{InputTokens: 15, OutputTokens: 20, TotalTokens: 35},
	}, nil
}

type stripeStub struct {
	event billing.Event
}

func (stripeStub) Ready() bool { return true }
func (stripeStub) CreateCheckout(context.Context, string, string) (billing.Checkout, error) {
	return billing.Checkout{ID: "cs_test", URL: "https://checkout.stripe.test/session"}, nil
}
func (stripeStub) CreatePortal(context.Context, string) (billing.Checkout, error) {
	return billing.Checkout{ID: "bps_test", URL: "https://billing.stripe.test/session"}, nil
}
func (s stripeStub) VerifyEvent([]byte, string) (billing.Event, error) { return s.event, nil }

func TestAuthenticatedChatAndCheckout(t *testing.T) {
	data := store.NewMemory()
	server := newTestServer(data, stripeStub{})

	unauthorized := httptest.NewRecorder()
	server.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/me", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d, want %d", unauthorized.Code, http.StatusUnauthorized)
	}

	token := authenticate(t, server)
	chat := request(t, server, http.MethodPost, "/v1/chat", token, `{"messages":[{"role":"user","content":"Hello"}]}`)
	if chat.Code != http.StatusOK {
		t.Fatalf("chat status = %d; body = %s", chat.Code, chat.Body.String())
	}
	var chatBody struct {
		Response ai.Result    `json:"response"`
		Usage    domain.Usage `json:"usage"`
	}
	decodeResponse(t, chat, &chatBody)
	if chatBody.Response.Provider != "gemini" || chatBody.Usage.UsedUnits != 35 || chatBody.Usage.RemainingUnits != 965 {
		t.Fatalf("unexpected chat response: %#v", chatBody)
	}

	checkout := request(t, server, http.MethodPost, "/v1/billing/checkout", token, `{}`)
	if checkout.Code != http.StatusOK || !bytes.Contains(checkout.Body.Bytes(), []byte("checkout.stripe.test")) {
		t.Fatalf("checkout response = %d %s", checkout.Code, checkout.Body.String())
	}
}

func TestStripeCheckoutWebhookActivatesPlus(t *testing.T) {
	data := store.NewMemory()
	event := billing.Event{ID: "evt_checkout", Type: "checkout.session.completed"}
	event.Data.Object = json.RawMessage(`{"client_reference_id":"gh_42","customer":"cus_42","subscription":"sub_42"}`)
	server := newTestServer(data, stripeStub{event: event})
	token := authenticate(t, server)

	webhook := request(t, server, http.MethodPost, "/v1/webhooks/stripe", "", `{}`)
	if webhook.Code != http.StatusOK {
		t.Fatalf("webhook response = %d %s", webhook.Code, webhook.Body.String())
	}
	duplicate := request(t, server, http.MethodPost, "/v1/webhooks/stripe", "", `{}`)
	if duplicate.Code != http.StatusOK {
		t.Fatalf("duplicate webhook response = %d %s", duplicate.Code, duplicate.Body.String())
	}

	me := request(t, server, http.MethodGet, "/v1/me", token, "")
	var body struct {
		User  domain.User  `json:"user"`
		Usage domain.Usage `json:"usage"`
	}
	decodeResponse(t, me, &body)
	if body.User.Plan != domain.PlanPlus || body.Usage.LimitUnits != 10_000 {
		t.Fatalf("plus was not activated: %#v", body)
	}
}

func TestOpenAICompatibleRouteAcceptsVisionMessages(t *testing.T) {
	server := newTestServer(store.NewMemory(), stripeStub{})
	token := authenticate(t, server)
	response := request(t, server, http.MethodPost, "/v1/chat/completions", token, `{
        "model":"managed-standard",
        "messages":[{"role":"user","content":[
            {"type":"text","text":"What is shown?"},
            {"type":"image_url","image_url":{"url":"data:image/png;base64,AA=="}}
        ]}]
    }`)
	if response.Code != http.StatusOK {
		t.Fatalf("compatible chat response = %d %s", response.Code, response.Body.String())
	}
	var body struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	decodeResponse(t, response, &body)
	if body.Model != "gemini-2.5-flash" || len(body.Choices) != 1 || body.Choices[0].Message.Content == "" {
		t.Fatalf("unexpected compatible response: %#v", body)
	}
}

func newTestServer(data store.Store, stripe StripeBilling) *Server {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return New(Config{PublicAppURL: "http://localhost:5173", FreeMonthlyUnits: 1_000, PlusMonthlyUnits: 10_000},
		githubStub{}, auth.NewSessions("test-session-secret-with-at-least-32-characters"), data, aiStub{}, stripe, logger)
}

func authenticate(t *testing.T, server *Server) string {
	t.Helper()
	response := request(t, server, http.MethodPost, "/v1/auth/github", "", `{"access_token":"github-token"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("auth response = %d %s", response.Code, response.Body.String())
	}
	var body struct {
		SessionToken string `json:"session_token"`
	}
	decodeResponse(t, response, &body)
	if body.SessionToken == "" {
		t.Fatal("auth response did not contain a session token")
	}
	return body.SessionToken
}

func request(t *testing.T, server *Server, method, path, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	server.ServeHTTP(recorder, req)
	return recorder
}

func decodeResponse(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		t.Fatalf("decode response: %v; body = %s", err, response.Body.String())
	}
}
