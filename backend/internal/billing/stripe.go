package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Stripe struct {
	secretKey       string
	webhookSecret   string
	plusPriceID     string
	successURL      string
	cancelURL       string
	portalReturnURL string
	client          *http.Client
	now             func() time.Time
}

type Config struct {
	SecretKey       string
	WebhookSecret   string
	PlusPriceID     string
	SuccessURL      string
	CancelURL       string
	PortalReturnURL string
}

type Checkout struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

func NewStripe(config Config, client *http.Client) *Stripe {
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	return &Stripe{
		secretKey: config.SecretKey, webhookSecret: config.WebhookSecret,
		plusPriceID: config.PlusPriceID, successURL: config.SuccessURL,
		cancelURL: config.CancelURL, portalReturnURL: config.PortalReturnURL,
		client: client, now: time.Now,
	}
}

func (s *Stripe) Ready() bool {
	return s.secretKey != "" && s.webhookSecret != "" && s.plusPriceID != ""
}

func (s *Stripe) CreateCheckout(ctx context.Context, userID, email string) (Checkout, error) {
	if s.secretKey == "" || s.plusPriceID == "" {
		return Checkout{}, errors.New("stripe checkout is not configured")
	}
	values := url.Values{
		"mode":                    {"subscription"},
		"success_url":             {s.successURL + "?session_id={CHECKOUT_SESSION_ID}"},
		"cancel_url":              {s.cancelURL},
		"client_reference_id":     {userID},
		"line_items[0][price]":    {s.plusPriceID},
		"line_items[0][quantity]": {"1"},
		"metadata[user_id]":       {userID},
	}
	if email != "" {
		values.Set("customer_email", email)
	}
	var output Checkout
	if err := s.postForm(ctx, "/v1/checkout/sessions", values, &output); err != nil {
		return Checkout{}, err
	}
	if output.ID == "" || output.URL == "" {
		return Checkout{}, errors.New("stripe returned an incomplete checkout session")
	}
	return output, nil
}

func (s *Stripe) CreatePortal(ctx context.Context, customerID string) (Checkout, error) {
	if s.secretKey == "" {
		return Checkout{}, errors.New("stripe portal is not configured")
	}
	if customerID == "" {
		return Checkout{}, errors.New("user has no stripe customer")
	}
	values := url.Values{"customer": {customerID}, "return_url": {s.portalReturnURL}}
	var output Checkout
	if err := s.postForm(ctx, "/v1/billing_portal/sessions", values, &output); err != nil {
		return Checkout{}, err
	}
	return output, nil
}

func (s *Stripe) postForm(ctx context.Context, path string, values url.Values, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.stripe.com"+path, strings.NewReader(values.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.secretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("stripe returned status %d", res.StatusCode)
	}
	return json.Unmarshal(payload, output)
}

type Event struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Data struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

func (s *Stripe) VerifyEvent(payload []byte, signature string) (Event, error) {
	if s.webhookSecret == "" {
		return Event{}, errors.New("stripe webhook secret is not configured")
	}
	timestamp, signatures, err := parseSignature(signature)
	if err != nil {
		return Event{}, err
	}
	if delta := s.now().UTC().Sub(time.Unix(timestamp, 0).UTC()); delta > 5*time.Minute || delta < -5*time.Minute {
		return Event{}, errors.New("stripe webhook timestamp is outside tolerance")
	}
	message := strconv.FormatInt(timestamp, 10) + "." + string(payload)
	mac := hmac.New(sha256.New, []byte(s.webhookSecret))
	_, _ = mac.Write([]byte(message))
	expected := mac.Sum(nil)
	valid := false
	for _, value := range signatures {
		decoded, decodeErr := hex.DecodeString(value)
		if decodeErr == nil && hmac.Equal(decoded, expected) {
			valid = true
			break
		}
	}
	if !valid {
		return Event{}, errors.New("invalid stripe webhook signature")
	}
	var event Event
	if err := json.Unmarshal(payload, &event); err != nil || event.ID == "" || event.Type == "" {
		return Event{}, errors.New("invalid stripe webhook payload")
	}
	return event, nil
}

func parseSignature(header string) (int64, []string, error) {
	var timestamp int64
	var signatures []string
	for _, field := range strings.Split(header, ",") {
		parts := strings.SplitN(strings.TrimSpace(field), "=", 2)
		if len(parts) != 2 {
			continue
		}
		switch parts[0] {
		case "t":
			timestamp, _ = strconv.ParseInt(parts[1], 10, 64)
		case "v1":
			signatures = append(signatures, parts[1])
		}
	}
	if timestamp == 0 || len(signatures) == 0 {
		return 0, nil, errors.New("malformed stripe signature")
	}
	return timestamp, signatures, nil
}
