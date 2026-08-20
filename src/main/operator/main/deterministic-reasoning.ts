import type { EnvironmentId, ReasoningContext, RoutedOutcome } from '@op-shared/types'

/**
 * Tiny, zero-token routes for tasks where an LLM would add cost and uncertainty.
 * This is intentionally narrow: unsupported language falls through to the model
 * provider chain instead of guessing.
 */

const OPEN_URL_GOAL =
    /^\s*(?:please\s+)?(?:open|visit|go\s+to|navigate\s+to|browse\s+to)\s+([^\s]+)\s*[.!?]?\s*$/i

export interface DeterministicBrowserRoute {
    kind: 'open-url'
    url: string
}

export function deterministicRouteFor(
    goal: string,
    environment: EnvironmentId | undefined
): DeterministicBrowserRoute | null {
    if (environment !== 'browser') return null
    const match = OPEN_URL_GOAL.exec(goal)
    if (!match) return null

    const raw = match[1].replace(/[),.;!?]+$/g, '')
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
        const parsed = new URL(candidate)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null
        return { kind: 'open-url', url: parsed.toString() }
    } catch {
        return null
    }
}

export function deterministicBrowserReason(
    context: ReasoningContext,
    environment: EnvironmentId | undefined
): RoutedOutcome | null {
    const route = deterministicRouteFor(context.goal, environment)
    if (!route) return null

    const performed = [...context.recentSteps].reverse().find(
        (step) =>
            step.action?.kind === 'type' &&
            normalizeUrl(step.action.text) === normalizeUrl(route.url) &&
            step.result?.status === 'success'
    )

    if (!performed) {
        return {
            kind: 'action',
            action: { kind: 'type', text: route.url },
            rationale: `Open ${new URL(route.url).hostname} directly in the sandboxed browser.`,
            providerId: 'deterministic-local',
            model: 'local-function'
        }
    }

    const evidence = context.currentObservation.pageText
        ?.split('\n')
        .find((line) => line.trimStart().startsWith('URL:'))
        ?.trim()

    return {
        kind: 'completion',
        summary: `Opened ${new URL(route.url).hostname} in the sandboxed browser.`,
        evidence,
        providerId: 'deterministic-local',
        model: 'local-function'
    }
}

function normalizeUrl(value: string): string {
    try {
        const parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`)
        return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, '')}${parsed.search}`
    } catch {
        return value.trim().toLowerCase()
    }
}
