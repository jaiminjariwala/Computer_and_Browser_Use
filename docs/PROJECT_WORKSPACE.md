# In-app project workspace

Open the folder button in the top toolbar (or Cmd+P), then **Open folder** to select a project. Until a folder is selected, the app uses a dedicated `Projects/My workspace` folder inside its application-data directory, not its own source repository.

The right panel includes editable Monaco file tabs, breadcrumbs, a lazy-loading file tree, a filter for loaded files, and a `+` menu for Files, Review, Terminal, and Browser. Cmd+S saves. Generated code can be saved as a new file. Unsaved edits survive hiding the panel; closing a modified tab asks before discarding them. Saves check the previous disk revision and reject conflicts.

Workspace tabs sit in the window's top title-bar row, aligned with the macOS window controls. A subtle gray `+` follows the tabs directly. The tab strip shares the right panel's width while keeping its controls outside the draggable title-bar regions.

## Embedded browser

The Browser item (or Cmd+T) opens an actual Electron `WebContentsView`, not an iframe or an external Chrome window. Its address bar accepts HTTP/HTTPS URLs, bare domains such as `youtube.com`, localhost development servers, and search terms. Back, forward, reload, stop-loading, and up to 12 tabs are supported. Links opening new windows are redirected into app tabs. Website cookies persist in the separate `persist:workspace-browser` partition. Remote content receives no app preload, Node access, or project IPC access; web security and Chromium sandboxing remain enabled. Non-web navigation schemes are rejected. Downloads use a native Save dialog and are never automatically executed.

The existing operator loop uses `EmbeddedBrowserEnvironment` in the merged desktop app. It perceives DOM text/elements and page previews from the displayed tab and performs gate-approved input on that exact page. Tab changes, navigation, resizing, and hiding invalidate observations. The normal operator safety checks and emergency stop remain in place. The standalone operator retains its previous Playwright backend as a fallback only when no embedded environment is injected.

Native pages hide when their tab is hidden or an app dialog/menu covers them. Cmd+L focuses the address bar while browsing; Cmd+T/Cmd+W create/close browser tabs. A task request opens/focuses its browser panel automatically. Browser tabs survive switching project folders, but tab lists are not yet restored after quitting the app.

## Building inside the app

Creation requests such as “Build a React app” or “Open Blender and create a rocket animation” route automatically to the project runner. There is no Chat/Workspace toggle. Short continuation requests such as “continue” and “fix this” retain project context; ordinary questions return to chat. A new conversation resets this context. Existing browser/computer automation remains available through the existing operator path.

The runner uses the configured managed/provider model and a bounded JSON action loop. It can list/read/write workspace files, request commands, open supported apps, and capture visible Figma/Blender windows. It receives recent conversation text and current attached design images. File writes automatically open in the right panel.

- Blender and Figma are the only curated automatic installers. The app announces a missing app, runs its named Homebrew cask, and opens it. Homebrew must already exist. Administrator prompts, licenses, sign-in, and Screen Recording permission are not bypassed.
- Model-generated commands require **Run command**, including project build scripts: these run on the user's Mac, not in a security sandbox. Commands entered directly in Terminal are already explicitly requested by the user.
- Stop in the project panel or composer, or Cmd+Shift+Escape, cancels the model request and active workspace subprocess groups. Existing saved files and installed software are not rolled back. An already-opened GUI app is not force-closed.
- File IPC is restricted to the trusted main app frame. Paths cannot escape the selected root or traverse symlinks. The agent's direct file tools exclude `.git`, `.ssh`, `.env` (except `.env.example`), and common private-key extensions. This is not a sandbox for approved subprocesses.

## Current boundaries

- This is an initial implementation, not demonstrated parity with a production computer-use agent. A complete live-model Blender scene/animation and Figma-to-app workflow still need end-to-end validation.
- Figma captures show visible content only. No document API or automatic traversal of all frames is implemented; attach exports/screenshots for hidden frames. Swift sources can be generated, but building/running them requires an appropriate installed Apple toolchain.
- Embedded Chromium is not full Safari/Chrome feature parity: no extensions, bookmarks manager, DRM guarantee, full password manager, or complete OAuth popup/opener support. Microphone, camera, location, and other site permission requests are denied with a visible notice for now. Password fields require manual entry. DOM perception currently covers the top document, so cross-origin frames and complex canvases may need manual help.
- Terminal is a command runner, not an interactive PTY. Output appears when a manually entered command ends; agent command output is streamed in the activity banner. Commands have a ten-minute timeout. Long-lived dev servers and interactive prompts need further terminal work.
- Review shows Git status and tracked diff in the selected folder. It does not stage, commit, or publish changes.
- One active workspace task is supported. Tabs and unsaved edits are session-local; the selected folder persists across app launches.

## Verification

`npm run typecheck`, `npm test`, and `npm run build` cover compilation and service regression tests. `node scripts/smoke-workspace.mjs` uses installed Google Chrome and fixture IPC to exercise the file tree, editing/saving, terminal tab, browser chrome, and Stop. It makes no paid model calls and does not edit real project files. Native browser behavior is checked separately in the running Electron app; YouTube loading and a zero-token agent task to open example.com were verified there.
