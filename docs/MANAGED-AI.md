# Managed AI and billing

The production product has three separate concerns. They must not be collapsed
into one model picker state:

1. **Identity** — GitHub sign-in establishes which user owns the chat and usage.
2. **Entitlement** — the product backend decides which free or paid allowance
   that user has remaining.
3. **Execution** — the backend chooses an eligible provider/model and holds the
   publisher's API credentials.

Selecting “Gemini” in the composer only requests a route. It is never proof that
Gemini credentials or quota exist. The client must show a model only when the
backend (or an explicit local developer override) reports that it is available.

## Request flow

```text
Electron app
  -> GitHub sign-in
  -> product session
  -> entitlement/model catalogue
  -> managed chat endpoint
  -> cost router
       1. deterministic local/server rule
       2. cheapest eligible model
       3. stronger model when the task requires it
  -> provider API
  -> metered result + updated allowance
```

The backend, not Electron, owns provider API keys. Shipping a shared Gemini,
OpenRouter, Anthropic, or OpenAI key inside the desktop bundle would let anyone
extract and spend it. Consumer ChatGPT/Claude subscriptions are also not API
credentials and are never scraped or reused by the app.

## Current development build

- GitHub sign-in is enforced in the renderer and again at the main-process IPC
  request boundary.
- Simple greetings use the deterministic zero-cost route and need no provider.
- The model menu lists only locally connected providers; offline defaults are
  no longer presented as live connections.
- Settings retains encrypted BYOK fields strictly as a local developer override
  until the managed backend is connected.
- When both Gemini and OpenRouter are configured, the composer selection now
  controls provider order instead of being a cosmetic label.

## Backend contract still required

The production gateway needs authenticated session exchange, an
entitlement-aware model catalogue, chat/vision endpoints, usage reservation and
settlement, provider routing, idempotency, rate limits, and an auditable ledger.
Until that service exists and is configured, substantive model questions in a
fresh install cannot be answered safely without a developer-provided key.
