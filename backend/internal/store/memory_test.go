package store

import (
	"testing"
	"time"

	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/domain"
)

func TestUsageAndSubscriptionLifecycle(t *testing.T) {
	data := NewMemory()
	user, err := data.UpsertGitHubUser(domain.User{GitHubID: 42, Login: "jaimin"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 29, 0, 0, 0, 0, time.UTC)
	usage, err := data.ChargeUsage(user.ID, 30, 100, now)
	if err != nil || usage.RemainingUnits != 70 || usage.Plan != domain.PlanFree {
		t.Fatalf("unexpected free usage: %#v, %v", usage, err)
	}
	if err := data.SetStripeSubscription(user.ID, "cus_1", "sub_1", "active", domain.PlanPlus); err != nil {
		t.Fatal(err)
	}
	usage, err = data.Usage(user.ID, 100, 1000, now)
	if err != nil || usage.Plan != domain.PlanPlus || usage.LimitUnits != 1000 {
		t.Fatalf("unexpected plus usage: %#v, %v", usage, err)
	}
	if _, err := data.ChargeUsage(user.ID, 971, 1000, now); err == nil {
		t.Fatal("usage beyond the allowance was accepted")
	}
	if processed, _ := data.EventProcessed("evt_1"); processed {
		t.Fatal("new webhook delivery was already processed")
	}
	if err := data.MarkEventProcessed("evt_1"); err != nil {
		t.Fatal(err)
	}
	if processed, _ := data.EventProcessed("evt_1"); !processed {
		t.Fatal("marked webhook delivery was not remembered")
	}
}
