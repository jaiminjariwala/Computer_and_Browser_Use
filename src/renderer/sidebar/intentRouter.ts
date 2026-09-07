/**
 * Lightweight intent router: decide whether a typed prompt should be answered
 * by the COPILOT (look-and-advise) or handed to the OPERATOR (do-it-for-me
 * autonomous agent), and if operator, which environment to use.
 *
 * This is a fast, offline heuristic (no model call) so a submit routes
 * instantly. It errs toward COPILOT when ambiguous, since copilot is the safe,
 * conversational default and never takes control of the machine on its own.
 *
 * Examples (from the product spec):
 *  - "how do I configure permissions in this dashboard?" -> copilot (advice)
 *  - "open youtube and play the chainsmokers closer"    -> operator + browser
 *  - "open system settings and turn on dark mode"       -> operator + local (Mac)
 */

export type RoutedIntent =
    | { mode: 'copilot' }
    | { mode: 'operator'; environment: 'browser' | 'local' }

/** Creation requests belong to the in-app project runner, never an external IDE. */
export function isWorkspaceTask(text: string): boolean {
    const t = text.trim().toLowerCase()
    // Code answers are chat, not filesystem/command tasks. The response viewer
    // automatically opens fenced code in the right-hand panel.
    if (isCodeQuestion(t)) return false
    if (/^(explain|what|why|how (does|do|to)|tell me|describe)\b/.test(t)) return false
    if (/\b(open|launch|install|download)\s+(?:(?:the|latest|stable|version|of|desktop|app)\s+)*(blender|figma)\b/.test(t)) return true
    return /\b(build|create|implement|develop|fix|edit|write|animate|make|convert|turn)\b/.test(t)
        && /\b(app|application|website|web\s*app|project|component|swift|react|code|script|blender|3d|animation|figma|files?)\b/.test(t)
}

/** Words that begin an advice/question (answer it, do not act). */
const QUESTION_STARTS =
    /^(how|what|what's|whats|why|when|where|who|which|whom|whose|is|are|am|do|does|did|can|could|should|would|will|may|might|explain|describe|summarize|summarise|tell me|show me how|help me understand|difference between|compare|review|analyze|analyse|suggest|recommend)\b/

/** Imperative verbs that mean "perform this task for me" (operator). */
const ACTION_VERBS =
    /\b(open|launch|start|go to|goto|navigate|visit|browse|play|pause|search for|look up|click|press|tap|scroll|type|enter|download|upload|install|uninstall|update|buy|purchase|book|order|reserve|sign in|log in|login|sign up|signup|register|log out|logout|fill|submit|send|post|tweet|share|reply|compose|create|make|add|remove|delete|rename|move|copy|turn on|turn off|switch on|switch off|enable|disable|toggle|mute|unmute|increase|decrease|raise|lower|set|change|adjust|connect|disconnect|pair|join|leave|book|schedule|cancel|checkout|check out)\b/

/** Signals the task is about the macOS machine itself (local environment). */
const LOCAL_SIGNALS =
    /\b(system settings|system preferences|system pref|control center|dark mode|light mode|night shift|true tone|wallpaper|screen saver|wi-?fi|bluetooth|airdrop|airplay|hotspot|finder|desktop|dock|menu ?bar|spotlight|launchpad|mission control|stage manager|volume|brightness|do not disturb|focus mode|notification|airport|trash|the app|an app|application|\.app|on my mac|on my computer|my computer|this mac|macos|mac os|terminal|activity monitor|keychain|accessibility settings|display settings|sound settings|battery|screen ?time)\b/

/**
 * Classify a prompt. `hasImages` true (a staged screenshot / file) strongly
 * implies "look at this and advise", so it routes to copilot.
 */
export function routeIntent(text: string, hasImages: boolean): RoutedIntent {
    const t = text.trim().toLowerCase()
    if (t.length === 0) return { mode: 'copilot' }
    if (isCodeQuestion(t)) return { mode: 'copilot' }

    // A screenshot/file attached means "read this and tell me" — advise, never act.
    if (hasImages) return { mode: 'copilot' }

    // A "how to open ..." / "should I ..." style prompt asks for guidance even
    // when it contains an action word — keep it in copilot.
    if (QUESTION_STARTS.test(t)) return { mode: 'copilot' }

    // A clear imperative command → operator. Pick the environment from signals.
    if (ACTION_VERBS.test(t)) {
        return { mode: 'operator', environment: pickEnvironment(t) }
    }

    // Anything else (a bare question, a statement) → copilot, the safe default.
    return { mode: 'copilot' }
}

export function isCodeQuestion(text: string): boolean {
    if (/\b(in (this|my|the) (project|repo|repository|file)|save (it|this|the code)|edit (this|my|the) file)\b/i.test(text)) return false
    return /\b(leetcode|rotting oranges|code example|code snippet)\b/i.test(text)
        || /\b(give|show|write|explain)\b.*\b(python|javascript|typescript|java|c\+\+|code|algorithm)\b/i.test(text)
}

/** Choose the operator environment: local when it targets the Mac, else browser. */
function pickEnvironment(lowerText: string): 'browser' | 'local' {
    // A macOS-specific signal ("system settings", "dark mode", "wifi", an app)
    // targets the Mac and wins; otherwise the task lives on the web (default).
    return LOCAL_SIGNALS.test(lowerText) ? 'local' : 'browser'
}
