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
       2. Gemini Flash when eligible and quota is available
       3. OpenRouter/free or another approved low-cost route
       4. OpenAI coding model when the task requires it or cheaper routes fail
  -> provider API
  -> metered result + actual serving model + updated Plus allowance
```

The backend, not Electron, owns provider API keys. Shipping a shared Gemini,
OpenRouter, Anthropic, or OpenAI key inside the desktop bundle would let anyone
extract and spend it. Consumer ChatGPT/Claude subscriptions are also not API
credentials and are never scraped or reused by the app.

## Product plans

The app's **Plus** subscription is $24.99 USD per month. It can include the app's
own coding agent, managed model allowance, vision, and computer/browser-use
features. It does not include, transfer, or impersonate a separate ChatGPT Plus,
Codex, Claude, or provider subscription. Any OpenAI API usage included in this
product is paid and metered by this product's backend.

Basic users may ask normal coding questions and receive working code through the
eligible low-cost route. Plus raises the allowance and unlocks the repo-scale
coding agent and specialized computer-use routes. Model answers must fence code
with a language identifier; the desktop client automatically opens the primary
generated code block in the right-side code workspace.

## Routing and usage semantics

The production router is task-aware and cost-aware, not tied to a model name:

1. Zero-cost deterministic answers run before any provider request.
2. Basic chat and coding prompts try an eligible managed Gemini route first.
3. OpenRouter or another approved low-cost provider is the next fallback.
4. The OpenAI coding route is used for repo-scale/agentic work, when policy
   selects it directly, or after the cheaper eligible providers report quota,
   rate-limit, authentication, or availability failures.

A malformed or low-quality answer is not silently retried across providers;
fallbacks are driven by typed provider failures and quota state so billing is
auditable and duplicate answers are avoided.

Every successful response records its actual `provider`, `model`, token/cost
usage, fallback reason (when applicable), and the user's product usage units.
The UI may display `Gemini 2.5 Flash`, `OpenRouter Free`, or `Codex` as the model
used for that response. It must never label a Gemini/OpenRouter response as
Codex.

All routes deduct from one product-owned **Plus usage** allowance. This is a
normalized product meter, not a provider token counter: inexpensive routes use
fewer units and the OpenAI coding route uses more. The account menu shows the
remaining percentage and reset time, while response metadata shows the actual
model used. This lets all provider costs count toward one customer allowance
without misrepresenting which provider produced an answer.

Suggested backend response metadata:

```json
{
  "route": {
    "provider": "openai",
    "model": "gpt-5-codex",
    "displayName": "Codex",
    "fallbackReason": "gemini_quota_exhausted"
  },
  "usage": {
    "unitsCharged": 12,
    "remainingUnits": 734,
    "limitUnits": 1000,
    "resetsAt": "2026-09-29T00:00:00Z"
  }
}
```

The exact OpenAI model id remains a server-side routing setting so it can be
updated without shipping a new Electron build.

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
