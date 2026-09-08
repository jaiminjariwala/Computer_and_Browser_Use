package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type testTransport func(*http.Request) (*http.Response, error)

func (f testTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCheckoutRejectsOldPrice(t *testing.T) {
	for _, amount := range []int{100, 2499} {
		t.Run(fmt.Sprint(amount), func(t *testing.T) {
			posts := 0
			client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
				body := fmt.Sprintf(`{"active":true,"currency":"usd","unit_amount":%d,"recurring":{"interval":"month","interval_count":1}}`, amount)
				if r.Method == http.MethodPost {
					posts++
					body = `{"id":"cs_test","url":"https://checkout.stripe.test/session"}`
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
			})}
			stripe := NewStripe(Config{SecretKey: "sk_test_fake", PlusPriceID: "price_test"}, client)
			_, err := stripe.CreateCheckout(context.Background(), "gh_42", "")
			if amount == 100 && (err != nil || posts != 1) {
				t.Fatalf("valid price: %v, posts %d", err, posts)
			}
			if amount != 100 && (err == nil || posts != 0) {
				t.Fatalf("old price allowed: %v, posts %d", err, posts)
			}
		})
	}
}

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

func TestCustomCheckoutUsesElementsAndFixedPrice(t *testing.T) {
	client := &http.Client{Transport: testTransport(func(r *http.Request) (*http.Response, error) {
		body := `{"active":true,"currency":"usd","unit_amount":100,"recurring":{"interval":"month","interval_count":1}}`
		if r.Method == "POST" {
			_ = r.ParseForm()
			if r.Form.Get("ui_mode") != "elements" || r.Form.Get("success_url") != "" || r.Form.Get("return_url") != "https://app.example/checkout/return" || r.Form.Get("line_items[0][price]") != "price_test" {
				t.Fatal("invalid custom checkout parameters")
			}
			body = `{"id":"cs_test","client_secret":"cs_test_secret_example"}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	stripe := NewStripe(Config{SecretKey: "sk_test", PlusPriceID: "price_test", CheckoutURL: "https://app.example/checkout"}, client)
	result, err := stripe.CreateCheckout(context.Background(), "gh_42", "")
	if err != nil || result.URL != "https://app.example/checkout#cs_test_secret_example" || result.ClientSecret != "" {
		t.Fatalf("bad checkout: %v", err)
	}
}
