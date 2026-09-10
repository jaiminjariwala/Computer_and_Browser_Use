# Browser login and custom checkout

The Go server owns OAuth code exchange and subscription creation. Electron opens
the user's normal browser; the app polls a short-lived, single-use handoff and
saves the GitHub token with macOS encrypted storage. No client secret is bundled
in the desktop app. Existing saved logins continue to work.

## Local setup

In GitHub Settings → Developer settings → OAuth Apps, select the app whose
client ID is used by this desktop build. Set its Authorization callback URL to:

`http://127.0.0.1:8787/v1/auth/github/callback`

Add these values to `backend/.env` (never commit it):

```dotenv
GITHUB_OAUTH_CLIENT_ID=your_existing_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_oauth_app_secret
GITHUB_OAUTH_REDIRECT_URL=http://127.0.0.1:8787/v1/auth/github/callback
STRIPE_PUBLISHABLE_KEY=pk_test_your_sandbox_key
CHECKOUT_URL=http://127.0.0.1:8787/checkout
```

Keep the existing sandbox Stripe secret, webhook secret, and USD $1/month price.
Leaving CHECKOUT_URL empty preserves the old hosted Stripe checkout.

Start Colima, then from `backend`:

```sh
docker compose up -d db
set -a
source .env
set +a
go run ./cmd/server
```

On this Mac the installed Compose command is `docker-compose up -d db`.

In a separate terminal, keep `stripe listen --forward-to
http://127.0.0.1:8787/v1/webhooks/stripe` running, with that listener's signing secret
in backend/.env. Restart the Go process after changing environment values.

## Payment page

Go serves the custom dark checkout page. Stripe Elements owns card input and
Express Checkout displays eligible wallets. The checkout client secret travels
in the URL fragment (not server access logs), is removed from the address bar,
and is retained only in the checkout tab's session storage for reloads.
The desktop account is attached server-side; no second app login is required.
Payment returns do not grant access: verified Stripe webhooks do.

Checkout currently opens in the system browser, outside agent-controlled tabs.
This keeps payment fields away from automation and gives wallets their normal
browser support. An in-app payment panel is not implemented by this change.

## Before distributing

Deploy Go and PostgreSQL to a persistent HTTPS host. Update the OAuth callback,
CHECKOUT_URL, and desktop MANAGED_BACKEND_URL to that host. Register the payment
domain with Stripe for wallets. Configure a production webhook directly to the
host, not the CLI. Do not ship localhost URLs or secrets. Keep sandbox until the
complete authorize → pay → webhook → access → restart flow passes.

Pending OAuth handoffs expire after ten minutes, are capped at 1,000, and live in
one Go process. A multi-instance deployment needs shared expiring handoff storage
or session affinity. Apply ingress rate limits before public deployment.
