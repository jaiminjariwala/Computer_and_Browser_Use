package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Short-lived handoffs are intentionally not app sessions. A server restart
// cancels pending authorizations, not existing encrypted desktop logins.
type oauthAttempt struct {
	verifier string
	expires  time.Time
	pollHash [32]byte
	token    string
	failure  string
	claimed  bool
}
type oauthPending struct {
	sync.Mutex
	entries map[string]*oauthAttempt
}

func randomKey() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func (s *Server) oauthStart(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if s.config.GitHubClientID == "" || s.config.GitHubClientSecret == "" || s.config.GitHubRedirectURL == "" {
		writeError(w, 503, "Browser sign-in needs GitHub OAuth configuration on the Go backend")
		return
	}
	state, poll, verifier := randomKey(), randomKey(), randomKey()
	s.oauth.Lock()
	for key, item := range s.oauth.entries {
		if time.Now().After(item.expires) {
			delete(s.oauth.entries, key)
		}
	}
	if len(s.oauth.entries) >= 1000 {
		s.oauth.Unlock()
		writeError(w, 429, "Too many pending sign-ins; retry shortly")
		return
	}
	s.oauth.entries[state] = &oauthAttempt{verifier: verifier, expires: time.Now().Add(10 * time.Minute), pollHash: sha256.Sum256([]byte(poll))}
	s.oauth.Unlock()
	digest := sha256.Sum256([]byte(verifier))
	query := url.Values{"client_id": {s.config.GitHubClientID}, "redirect_uri": {s.config.GitHubRedirectURL}, "scope": {"read:user"}, "state": {state}, "code_challenge": {base64.RawURLEncoding.EncodeToString(digest[:])}, "code_challenge_method": {"S256"}}
	writeJSON(w, 200, map[string]string{"authorization_url": "https://github.com/login/oauth/authorize?" + query.Encode(), "state": state, "poll_token": poll})
}

func (s *Server) oauthCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
	state := r.URL.Query().Get("state")
	s.oauth.Lock()
	item := s.oauth.entries[state]
	if item == nil || time.Now().After(item.expires) || item.claimed {
		s.oauth.Unlock()
		http.Error(w, "Sign-in expired. Return to Codex Lite and try again.", 400)
		return
	}
	item.claimed = true
	verifier := item.verifier
	s.oauth.Unlock()
	failure, token := "GitHub authorization failed. Please try again.", ""
	if r.URL.Query().Get("error") == "" && r.URL.Query().Get("code") != "" {
		values := url.Values{"client_id": {s.config.GitHubClientID}, "client_secret": {s.config.GitHubClientSecret}, "redirect_uri": {s.config.GitHubRedirectURL}, "code": {r.URL.Query().Get("code")}, "code_verifier": {verifier}}
		req, err := http.NewRequestWithContext(r.Context(), "POST", "https://github.com/login/oauth/access_token", strings.NewReader(values.Encode()))
		if err == nil {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			req.Header.Set("Accept", "application/json")
			response, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
			if err == nil {
				var result struct {
					Token string `json:"access_token"`
				}
				if response.StatusCode == 200 && json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result) == nil {
					token = result.Token
				}
				response.Body.Close()
			}
		}
	}
	s.oauth.Lock()
	item.token = token
	if token == "" {
		item.failure = failure
	}
	item.verifier = ""
	s.oauth.Unlock()
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if token == "" {
		w.WriteHeader(400)
		_, _ = io.WriteString(w, failure)
		return
	}
	_, _ = io.WriteString(w, "You're signed in. You can close this tab and return to Codex Lite.")
}

func (s *Server) oauthPoll(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var input struct {
		State     string `json:"state"`
		PollToken string `json:"poll_token"`
	}
	if decodeJSON(w, r, &input, 4096) != nil {
		writeError(w, 400, "Invalid sign-in request")
		return
	}
	s.oauth.Lock()
	defer s.oauth.Unlock()
	item := s.oauth.entries[input.State]
	if item == nil || time.Now().After(item.expires) || item.pollHash != sha256.Sum256([]byte(input.PollToken)) {
		writeError(w, 401, "Sign-in expired or invalid")
		return
	}
	if item.failure != "" {
		delete(s.oauth.entries, input.State)
		writeError(w, 400, item.failure)
		return
	}
	if item.token == "" {
		writeJSON(w, 202, map[string]string{"status": "pending"})
		return
	}
	delete(s.oauth.entries, input.State)
	writeJSON(w, 200, map[string]string{"access_token": item.token})
}
