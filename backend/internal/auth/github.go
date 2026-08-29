package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/domain"
)

type GitHub struct {
	client  *http.Client
	baseURL string
}

func NewGitHub(client *http.Client) *GitHub {
	if client == nil {
		client = &http.Client{Timeout: 12 * time.Second}
	}
	return &GitHub{client: client, baseURL: "https://api.github.com"}
}

func (g *GitHub) Verify(ctx context.Context, accessToken string) (domain.User, error) {
	if strings.TrimSpace(accessToken) == "" {
		return domain.User{}, errors.New("github access token is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.baseURL+"/user", nil)
	if err != nil {
		return domain.User{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "computer-or-browser-use")
	res, err := g.client.Do(req)
	if err != nil {
		return domain.User{}, fmt.Errorf("verify github identity: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return domain.User{}, fmt.Errorf("github rejected token with status %d", res.StatusCode)
	}
	var profile struct {
		ID        json.Number `json:"id"`
		Login     string      `json:"login"`
		Name      string      `json:"name"`
		Email     string      `json:"email"`
		AvatarURL string      `json:"avatar_url"`
	}
	decoder := json.NewDecoder(res.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&profile); err != nil {
		return domain.User{}, fmt.Errorf("decode github profile: %w", err)
	}
	id, err := profile.ID.Int64()
	if err != nil || id <= 0 || profile.Login == "" {
		return domain.User{}, errors.New("github returned an invalid profile")
	}
	return domain.User{
		GitHubID:  id,
		Login:     profile.Login,
		Name:      profile.Name,
		Email:     profile.Email,
		AvatarURL: profile.AvatarURL,
	}, nil
}
