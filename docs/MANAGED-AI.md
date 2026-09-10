# Codex Lite: local AI and online app access

Codex Lite is an independent project, not an OpenAI product.

## First launch
The macOS app prepares Ollama in the background and pulls `qwen2.5-coder:1.5b`
(about 986 MB for the model, plus the Ollama runtime). A visible status above
the composer includes progress and pause/resume. Pausing persists across launches.
At least 5 GB of free space is required during setup. Downloading the app alone
does not start setup; opening it does. The first answer must wait for setup.

Ollama is downloaded from its official site, extracted inside the existing
app-data directory, and verified using macOS code-signing and Gatekeeper checks.
An installed /Applications/Ollama.app can supply the runtime instead.
The app starts its own loopback-only server on port 11435, disables Ollama cloud
features, and stores model files under app data. It does not install a login item
or overwrite the user's existing Ollama installation.

## Answers
Chat and project-agent requests use local Ollama only. Gemini and OpenRouter
keys are not required, and there is no paid/cloud fallback. The starter model
supports text/code, not images or screenshot-driven automation. Existing browser
panels and automation code remain, but vision automation is blocked until a
suitable local vision model is integrated. Small models can produce incorrect
answers and may struggle with complex file-editing tasks.

## Access and billing
GitHub sign-in and the Go/Stripe backend remain online. Desktop access is
$1 USD/month and is checked before new chat/workspace requests. It pays for the
app, not cloud tokens. Local inference does not consume the legacy backend
usage meter. Stripe sandbox price is configured locally; no live subscription
was created or migrated. Internal Plus identifiers and the old user-data path
remain for compatibility with saved chats.

A distributed build still needs a deployed HTTPS billing/auth backend and signed
webhooks. Local AI alone does not make localhost billing work on another Mac.
Legacy cloud code remains in the repository but is not used by the desktop route.

## Limits
Automatic installation currently supports macOS only. Setup needs internet;
local inference uses the user's CPU/GPU, RAM, disk and power. Memory/context is
bounded, not whole-codebase omniscience. Workspaces retrieve relevant files.
Downloads may fail or need retry; OS security blocks are surfaced, not bypassed.
