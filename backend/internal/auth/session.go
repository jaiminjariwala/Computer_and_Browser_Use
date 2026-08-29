package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Claims struct {
	Subject string `json:"sub"`
	Issued  int64  `json:"iat"`
	Expiry  int64  `json:"exp"`
}

type Sessions struct {
	secret []byte
	now    func() time.Time
}

func NewSessions(secret string) *Sessions {
	return &Sessions{secret: []byte(secret), now: time.Now}
}

func (s *Sessions) Issue(userID string, ttl time.Duration) (string, error) {
	now := s.now().UTC()
	header, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	payload, err := json.Marshal(Claims{Subject: userID, Issued: now.Unix(), Expiry: now.Add(ttl).Unix()})
	if err != nil {
		return "", err
	}
	unsigned := encode(header) + "." + encode(payload)
	return unsigned + "." + s.sign(unsigned), nil
}

func (s *Sessions) Verify(token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, errors.New("invalid session token")
	}
	unsigned := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(parts[2]), []byte(s.sign(unsigned))) {
		return Claims{}, errors.New("invalid session signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, errors.New("invalid session payload")
	}
	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil || claims.Subject == "" {
		return Claims{}, errors.New("invalid session claims")
	}
	if s.now().UTC().Unix() >= claims.Expiry {
		return Claims{}, errors.New("session expired")
	}
	return claims, nil
}

func (s *Sessions) sign(value string) string {
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func encode(value []byte) string {
	return base64.RawURLEncoding.EncodeToString(value)
}

func Bearer(header string) (string, error) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", errors.New("missing bearer token")
	}
	return parts[1], nil
}

func ParseGitHubID(value any) (int64, error) {
	switch id := value.(type) {
	case float64:
		return int64(id), nil
	case json.Number:
		return id.Int64()
	case string:
		return strconv.ParseInt(id, 10, 64)
	default:
		return 0, fmt.Errorf("unsupported github id %T", value)
	}
}
