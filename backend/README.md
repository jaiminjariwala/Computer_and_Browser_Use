# Computer or Browser Use backend

This Go service is the production trust boundary for managed AI and Plus billing. Provider and Stripe secrets live here, never inside the Electron app. Users authenticate with GitHub once and receive an app session; they do not paste Gemini, OpenRouter, OpenAI, or Stripe keys.

## Implemented API

- `POST /v1/auth/github` verifies an existing GitHub OAuth access token and returns a 30-day app session.
- `GET /v1/me` and `GET /v1/usage` return account, plan, and monthly allowance state.
- `POST /v1/chat` routes managed requests through Gemini, then OpenRouter, then OpenAI/Codex when configured. The response reports the provider and model actually used.
- `POST /v1/billing/checkout` creates a Stripe-hosted Plus subscription checkout.
- `POST /v1/billing/portal` creates a Stripe customer-portal session.
- `POST /v1/webhooks/stripe` verifies Stripe signatures, handles duplicate deliveries, and activates or removes Plus access.

## Run locally

```bash
cd backend
docker compose up -d db
# With Homebrew Docker CLI + Colima, use: docker-compose up -d db
cp .env.example .env
set -a
source .env
set +a
go run ./cmd/server
```

At minimum, set a random `SESSION_SECRET` with 32 or more characters and one managed provider key. `DATABASE_URL` enables persistent PostgreSQL storage and applies the current schema automatically. The included Compose database uses host port `55432` so it does not collide with a normal PostgreSQL installation on `5432`. Without `DATABASE_URL`, the server clearly logs that it is using restart-only development memory. The service listens on `http://localhost:8787` by default.

In a second terminal, point the Electron build at the service:

```bash
cd ..
cp .env.example .env.local
npm run dev
```

Only the public backend URL is embedded in Electron. All model and Stripe secrets remain in `backend/.env` or the production host's secret manager.

Run the checks with:

```bash
GOCACHE=/tmp/cbu-go-build-cache go test ./...
GOCACHE=/tmp/cbu-go-build-cache go vet ./...
```

## Stripe test-mode setup

1. Create one recurring monthly product named **Computer or Browser Use Plus** priced at **$24.99 USD**.
2. Put the resulting `price_...` identifier in `STRIPE_PLUS_PRICE_ID` and your test secret in `STRIPE_SECRET_KEY`.
3. Register `POST /v1/webhooks/stripe` as a webhook endpoint and subscribe it to:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Put the endpoint signing secret in `STRIPE_WEBHOOK_SECRET`.

The app should open the returned Checkout URL in the user's browser. Stripe collects card details; the backend never receives them.

## Persistence and production

The PostgreSQL store persists users, usage periods, Stripe customer/subscription IDs, and processed webhook IDs. Usage charging uses a row lock and transaction so parallel chat requests cannot push the recorded allowance past its limit. The in-memory store remains available only for quick backend development when `DATABASE_URL` is omitted.

Use a hosted secret manager for all production credentials, restrict CORS to the shipped app's origin, enable rate limiting, and deploy behind HTTPS.
