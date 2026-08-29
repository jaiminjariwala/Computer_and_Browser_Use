package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"
)

func TestVerifyEvent(t *testing.T) {
	now := time.Date(2026, 8, 29, 12, 0, 0, 0, time.UTC)
	stripe := NewStripe(Config{WebhookSecret: "whsec_test"}, nil)
	stripe.now = func() time.Time { return now }
	payload := []byte(`{"id":"evt_1","type":"checkout.session.completed","data":{"object":{}}}`)
	message := fmt.Sprintf("%d.%s", now.Unix(), payload)
	mac := hmac.New(sha256.New, []byte("whsec_test"))
	_, _ = mac.Write([]byte(message))
	signature := fmt.Sprintf("t=%d,v1=%s", now.Unix(), hex.EncodeToString(mac.Sum(nil)))
	event, err := stripe.VerifyEvent(payload, signature)
	if err != nil || event.ID != "evt_1" {
		t.Fatalf("unexpected event=%#v err=%v", event, err)
	}
	if _, err := stripe.VerifyEvent(payload, signature+"00"); err == nil {
		t.Fatal("invalid webhook signature was accepted")
	}
}
