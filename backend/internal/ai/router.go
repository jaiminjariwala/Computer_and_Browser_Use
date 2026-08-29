package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Message struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type Request struct {
	Model    string    `json:"model,omitempty"`
	Messages []Message `json:"messages"`
}

type TokenUsage struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
	TotalTokens  int64 `json:"total_tokens"`
}

type Result struct {
	Provider string     `json:"provider"`
	Model    string     `json:"model"`
	Text     string     `json:"text"`
	Usage    TokenUsage `json:"token_usage"`
}

type Provider interface {
	Name() string
	Model() string
	Complete(context.Context, Request) (Result, error)
}

type Router struct {
	providers []Provider
}

func NewRouter(providers ...Provider) *Router {
	active := make([]Provider, 0, len(providers))
	for _, provider := range providers {
		if provider != nil {
			active = append(active, provider)
		}
	}
	return &Router{providers: active}
}

func (r *Router) Available() bool { return len(r.providers) > 0 }

func (r *Router) Complete(ctx context.Context, request Request) (Result, error) {
	if len(request.Messages) == 0 {
		return Result{}, errors.New("at least one message is required")
	}
	var failures []string
	for _, provider := range r.providers {
		result, err := provider.Complete(ctx, request)
		if err == nil {
			return result, nil
		}
		failures = append(failures, provider.Name()+": "+err.Error())
	}
	if len(failures) == 0 {
		return Result{}, errors.New("no managed AI provider is configured")
	}
	return Result{}, fmt.Errorf("all managed AI providers failed: %s", strings.Join(failures, "; "))
}

type CompatibleProvider struct {
	provider string
	baseURL  string
	model    string
	apiKey   string
	client   *http.Client
}

func NewCompatibleProvider(provider, baseURL, model, apiKey string, client *http.Client) Provider {
	if strings.TrimSpace(apiKey) == "" {
		return nil
	}
	if client == nil {
		client = &http.Client{Timeout: 45 * time.Second}
	}
	return &CompatibleProvider{provider: provider, baseURL: strings.TrimRight(baseURL, "/"), model: model, apiKey: apiKey, client: client}
}

func (p *CompatibleProvider) Name() string  { return p.provider }
func (p *CompatibleProvider) Model() string { return p.model }

func (p *CompatibleProvider) Complete(ctx context.Context, input Request) (Result, error) {
	body, err := json.Marshal(map[string]any{"model": p.model, "messages": input.Messages})
	if err != nil {
		return Result{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	if p.provider == "openrouter" {
		req.Header.Set("HTTP-Referer", "https://computer-or-browser-use.app")
		req.Header.Set("X-Title", "Computer or Browser Use")
	}
	res, err := p.client.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return Result{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return Result{}, fmt.Errorf("provider returned status %d", res.StatusCode)
	}
	var decoded struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int64 `json:"prompt_tokens"`
			CompletionTokens int64 `json:"completion_tokens"`
			TotalTokens      int64 `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return Result{}, fmt.Errorf("decode provider response: %w", err)
	}
	if len(decoded.Choices) == 0 || strings.TrimSpace(decoded.Choices[0].Message.Content) == "" {
		return Result{}, errors.New("provider returned an empty answer")
	}
	model := decoded.Model
	if model == "" {
		model = p.model
	}
	return Result{
		Provider: p.provider,
		Model:    model,
		Text:     decoded.Choices[0].Message.Content,
		Usage: TokenUsage{
			InputTokens:  decoded.Usage.PromptTokens,
			OutputTokens: decoded.Usage.CompletionTokens,
			TotalTokens:  decoded.Usage.TotalTokens,
		},
	}, nil
}

type OpenAIResponsesProvider struct {
	model  string
	apiKey string
	client *http.Client
}

func NewOpenAIResponsesProvider(model, apiKey string, client *http.Client) Provider {
	if strings.TrimSpace(apiKey) == "" {
		return nil
	}
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second}
	}
	return &OpenAIResponsesProvider{model: model, apiKey: apiKey, client: client}
}

func (p *OpenAIResponsesProvider) Name() string  { return "openai" }
func (p *OpenAIResponsesProvider) Model() string { return p.model }

func (p *OpenAIResponsesProvider) Complete(ctx context.Context, input Request) (Result, error) {
	body, err := json.Marshal(map[string]any{"model": p.model, "input": input.Messages, "store": false})
	if err != nil {
		return Result{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := p.client.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return Result{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return Result{}, fmt.Errorf("provider returned status %d", res.StatusCode)
	}
	var decoded struct {
		Model  string `json:"model"`
		Output []struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		Usage struct {
			InputTokens  int64 `json:"input_tokens"`
			OutputTokens int64 `json:"output_tokens"`
			TotalTokens  int64 `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return Result{}, fmt.Errorf("decode openai response: %w", err)
	}
	var textParts []string
	for _, output := range decoded.Output {
		for _, content := range output.Content {
			if content.Type == "output_text" && strings.TrimSpace(content.Text) != "" {
				textParts = append(textParts, content.Text)
			}
		}
	}
	text := strings.Join(textParts, "\n")
	if text == "" {
		return Result{}, errors.New("openai returned an empty answer")
	}
	model := decoded.Model
	if model == "" {
		model = p.model
	}
	return Result{Provider: "openai", Model: model, Text: text, Usage: TokenUsage{
		InputTokens: decoded.Usage.InputTokens, OutputTokens: decoded.Usage.OutputTokens, TotalTokens: decoded.Usage.TotalTokens,
	}}, nil
}
