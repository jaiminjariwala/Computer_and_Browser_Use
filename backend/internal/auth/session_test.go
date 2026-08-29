package auth

import (
	"strings"
	"testing"
	"time"
)

func TestSessionIssueVerifyAndTamper(t *testing.T) {
	sessions := NewSessions(strings.Repeat("s", 32))
	now := time.Date(2026, 8, 29, 12, 0, 0, 0, time.UTC)
	sessions.now = func() time.Time { return now }
	token, err := sessions.Issue("gh_123", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := sessions.Verify(token)
	if err != nil || claims.Subject != "gh_123" {
		t.Fatalf("unexpected claims: %#v, %v", claims, err)
	}
	if _, err := sessions.Verify(token + "x"); err == nil {
		t.Fatal("tampered token was accepted")
	}
	sessions.now = func() time.Time { return now.Add(2 * time.Hour) }
	if _, err := sessions.Verify(token); err == nil {
		t.Fatal("expired token was accepted")
	}
}
