package ai

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type fakeProvider struct {
	name  string
	model string
	text  string
	err   error
	calls *[]string
}

func (f fakeProvider) Name() string  { return f.name }
func (f fakeProvider) Model() string { return f.model }
func (f fakeProvider) Complete(context.Context, Request) (Result, error) {
	*f.calls = append(*f.calls, f.name)
	if f.err != nil {
		return Result{}, f.err
	}
	return Result{Provider: f.name, Model: f.model, Text: f.text, Usage: TokenUsage{TotalTokens: 10}}, nil
}

func TestRouterUsesCheapProvidersBeforeCodex(t *testing.T) {
	var calls []string
	router := NewRouter(
		fakeProvider{name: "gemini", model: "flash", err: errors.New("quota"), calls: &calls},
		fakeProvider{name: "openrouter", model: "free", text: "answer", calls: &calls},
		fakeProvider{name: "openai", model: "gpt-5-codex", text: "codex", calls: &calls},
	)
	result, err := router.Complete(context.Background(), Request{Messages: []Message{{Role: "user", Content: "code"}}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Provider != "openrouter" || !reflect.DeepEqual(calls, []string{"gemini", "openrouter"}) {
		t.Fatalf("unexpected route result=%#v calls=%v", result, calls)
	}
}

func TestRouterFallsBackToCodex(t *testing.T) {
	var calls []string
	router := NewRouter(
		fakeProvider{name: "gemini", err: errors.New("quota"), calls: &calls},
		fakeProvider{name: "openrouter", err: errors.New("unavailable"), calls: &calls},
		fakeProvider{name: "openai", model: "gpt-5-codex", text: "codex answer", calls: &calls},
	)
	result, err := router.Complete(context.Background(), Request{Messages: []Message{{Role: "user", Content: "code"}}})
	if err != nil || result.Provider != "openai" {
		t.Fatalf("unexpected fallback result=%#v err=%v", result, err)
	}
	if !reflect.DeepEqual(calls, []string{"gemini", "openrouter", "openai"}) {
		t.Fatalf("unexpected chain: %v", calls)
	}
}
