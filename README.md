# Computer or Browser Use

**A context-aware AI workspace for macOS.**

Computer or Browser Use brings your conversations, screen, files, videos, and
email into one place. Ask for help, share what you are looking at, or hand off a
task when you want it done for you.

Smart Copilot is one feature inside Computer or Browser Use: it looks at the
context you share and gives you the next useful step. Computer or Browser Use
can also remember useful context, work with documents and media, run browser or
Mac tasks, and repeat saved workflows.

## What Computer or Browser Use can do

- **Chat with context** — keep conversations and history together instead of
  starting from scratch every time.
- **See what you see** — capture a region, a window, or the full screen and ask
  about it.
- **Understand more than screenshots** — attach images, PDFs, videos, camera
  recordings, or the email currently selected in Apple Mail or Outlook.
- **Take voice input locally** — dictate with on-device Whisper.
- **Remember useful details** — review, add, or clear saved memory from
  Settings.
- **Handle a task** — ask Computer or Browser Use to work in a Playwright
  browser or on your Mac and follow its progress in the chat.
- **Repeat routine work** — save a task as a playbook, run it again with one
  click, or schedule it daily while the app is open.
- **Use your own AI** — connect Gemini, OpenRouter, or another
  OpenAI-compatible provider.

## How it fits together

| What you do | What Computer or Browser Use does |
| --- | --- |
| Ask a question | Answers in the conversation. |
| Share a screen capture, file, video, or email | Uses it as context for the answer. |
| Give it a clear task | Routes the task to the browser or your Mac. |
| Save a task as a playbook | Makes it reusable and optionally scheduled. |

You can switch between chat and task views yourself, but most prompts are
routed automatically. Questions stay in chat. Clear instructions such as
“search for three options and compare them” or “open System Settings and turn
on dark mode” are treated as tasks.

## Download

**[Download the latest macOS build](https://github.com/jaiminjariwala/Computer_and_Browser_Use/releases/latest)**

The current release is for Apple Silicon. Open the downloaded DMG and drag the
app into Applications.

The app is not notarized yet. On first launch, right-click it, choose **Open**,
then confirm once more. If macOS still blocks it:

```bash
xattr -cr "/Applications/Computer or Browser Use.app"
```

Every user signs in with GitHub before starting a chat. Zero-cost deterministic
requests run locally; model-backed requests are designed to go through the
product's managed AI gateway, where free allowances, paid usage, routing, and
provider credentials are enforced server-side. Publisher API keys must never be
bundled in the Electron app.

The current local development build still supports encrypted provider keys in
Settings as a developer override. That is not the production onboarding flow,
and the chat no longer asks end users to paste provider secrets inline. See
[Managed AI and billing](./docs/MANAGED-AI.md).

## Getting started

1. Open Computer or Browser Use and sign in with GitHub.
2. Type a question, or share something from the attachment menu.
3. To ask about your screen, use one of the capture shortcuts below.
4. To hand off a task, describe the outcome you want. Review the environment,
   approval mode, and step budget before it starts.

### Shortcuts

| Shortcut | Action |
| --- | --- |
| **Cmd+Shift+Space** | Show or hide Computer or Browser Use |
| **Cmd+Shift+D** | Capture a region |
| **Cmd+Shift+F** | Capture a window |
| **Cmd+Shift+S** | Capture the full screen |
| **Cmd+Shift+Esc** | Stop an active task |

Browser tasks do not need macOS control permissions. Tasks that act on your Mac
need **Screen Recording** and **Accessibility**. Voice input needs
**Microphone**, and camera recording needs **Camera**.

## Privacy and control

- Chats, memories, playbooks, and settings are stored on your Mac.
- The messages and selected context you send are passed to the AI provider you
  configure.
- Screen capture only starts when you use a Computer or Browser Use shortcut.
- Raw video stays on your Mac. Computer or Browser Use sends a bounded set of
  sampled frames to the provider instead.
- Task runs have an activity trail, an approval mode, a step budget, and a
  global stop shortcut.
- Stored provider keys and the optional GitHub token are encrypted and never
  exposed to the renderer.

Computer control is still experimental. Use Manual mode for anything involving
messages, purchases, credentials, deleting data, or other hard-to-reverse
actions.

## Build from source

You need macOS and Node.js `^20.19` or `>=22.12` (Node 22 is recommended).

```bash
git clone https://github.com/jaiminjariwala/Computer_and_Browser_Use.git
cd Computer_and_Browser_Use
npm install
npx playwright install chromium
npm run dev
```

For tasks that control your Mac, install the current input fallback too:

```bash
brew install cliclick
```

Useful checks:

```bash
npm run typecheck
npm test
npm run eval:operator
npm run build
```

The managed AI and Plus billing service is being built in Go under
[`backend`](./backend). Its local setup and Stripe test-mode checklist are in
[`backend/README.md`](./backend/README.md).

For local managed-service development, copy [`.env.example`](./.env.example)
to `.env.local`, run the Go service and PostgreSQL as described above, then
start Electron. Release builds should set `MANAGED_BACKEND_URL` to the deployed
HTTPS service; provider and Stripe secrets must never be added to the Electron
environment file.

## Documentation

- [Setup](./docs/SETUP.md)
- [How Computer or Browser Use works](./docs/HOW-IT-WORKS.md)
- [Safety model](./docs/SAFETY.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Development and packaging](./docs/DEVELOPMENT.md)
- [Managed Go backend and Stripe](./backend/README.md)

## Status

Computer or Browser Use is a personal R&D project. It is currently macOS-only
and ships as an unsigned build. Deterministic routes work locally; model-backed
chat and reasoning require a provider you connect. Browser and Mac task
execution should be treated as experimental.
