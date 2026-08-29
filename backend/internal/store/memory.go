package store

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jaiminjariwala5/computer-browser-use/backend/internal/domain"
)

var ErrNotFound = errors.New("not found")

type Store interface {
	UpsertGitHubUser(user domain.User) (domain.User, error)
	UserByID(id string) (domain.User, error)
	UserByStripeCustomer(customerID string) (domain.User, error)
	SetStripeSubscription(userID, customerID, subscriptionID, status string, plan domain.Plan) error
	ChargeUsage(userID string, units, limit int64, now time.Time) (domain.Usage, error)
	Usage(userID string, freeLimit, plusLimit int64, now time.Time) (domain.Usage, error)
	EventProcessed(eventID string) (bool, error)
	MarkEventProcessed(eventID string) error
}

type Memory struct {
	mu             sync.Mutex
	users          map[string]domain.User
	githubToUser   map[int64]string
	stripeToUser   map[string]string
	processedEvent map[string]struct{}
}

func NewMemory() *Memory {
	return &Memory{
		users:          make(map[string]domain.User),
		githubToUser:   make(map[int64]string),
		stripeToUser:   make(map[string]string),
		processedEvent: make(map[string]struct{}),
	}
}

func (m *Memory) UpsertGitHubUser(input domain.User) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id, ok := m.githubToUser[input.GitHubID]; ok {
		existing := m.users[id]
		existing.Login, existing.Name, existing.Email, existing.AvatarURL = input.Login, input.Name, input.Email, input.AvatarURL
		m.users[id] = existing
		return existing, nil
	}
	if input.ID == "" {
		input.ID = fmt.Sprintf("gh_%d", input.GitHubID)
	}
	input.Plan = domain.PlanFree
	input.SubscriptionStatus = "inactive"
	input.UsagePeriodStart = monthStart(time.Now().UTC())
	m.users[input.ID] = input
	m.githubToUser[input.GitHubID] = input.ID
	return input, nil
}

func (m *Memory) UserByID(id string) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	user, ok := m.users[id]
	if !ok {
		return domain.User{}, ErrNotFound
	}
	return user, nil
}

func (m *Memory) UserByStripeCustomer(customerID string) (domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.stripeToUser[customerID]
	if !ok {
		return domain.User{}, ErrNotFound
	}
	return m.users[id], nil
}

func (m *Memory) SetStripeSubscription(userID, customerID, subscriptionID, status string, plan domain.Plan) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	user, ok := m.users[userID]
	if !ok {
		return ErrNotFound
	}
	user.StripeCustomerID = customerID
	user.StripeSubscriptionID = subscriptionID
	user.SubscriptionStatus = status
	user.Plan = plan
	m.users[userID] = user
	if customerID != "" {
		m.stripeToUser[customerID] = userID
	}
	return nil
}

func (m *Memory) ChargeUsage(userID string, units, limit int64, now time.Time) (domain.Usage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	user, ok := m.users[userID]
	if !ok {
		return domain.Usage{}, ErrNotFound
	}
	resetUsageIfNeeded(&user, now)
	if units < 0 || user.UsedUnits+units > limit {
		return domain.Usage{}, errors.New("usage limit exceeded")
	}
	user.UsedUnits += units
	m.users[userID] = user
	return usageFor(user, limit), nil
}

func (m *Memory) Usage(userID string, freeLimit, plusLimit int64, now time.Time) (domain.Usage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	user, ok := m.users[userID]
	if !ok {
		return domain.Usage{}, ErrNotFound
	}
	resetUsageIfNeeded(&user, now)
	m.users[userID] = user
	limit := freeLimit
	if user.Plan == domain.PlanPlus {
		limit = plusLimit
	}
	return usageFor(user, limit), nil
}

func (m *Memory) EventProcessed(eventID string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, exists := m.processedEvent[eventID]
	return exists, nil
}

func (m *Memory) MarkEventProcessed(eventID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.processedEvent[eventID] = struct{}{}
	return nil
}

func resetUsageIfNeeded(user *domain.User, now time.Time) {
	start := monthStart(now.UTC())
	if user.UsagePeriodStart.IsZero() || user.UsagePeriodStart.Before(start) {
		user.UsagePeriodStart = start
		user.UsedUnits = 0
	}
}

func monthStart(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func usageFor(user domain.User, limit int64) domain.Usage {
	remaining := limit - user.UsedUnits
	if remaining < 0 {
		remaining = 0
	}
	return domain.Usage{
		Plan:           user.Plan,
		UsedUnits:      user.UsedUnits,
		LimitUnits:     limit,
		RemainingUnits: remaining,
		ResetsAt:       user.UsagePeriodStart.AddDate(0, 1, 0),
	}
}
