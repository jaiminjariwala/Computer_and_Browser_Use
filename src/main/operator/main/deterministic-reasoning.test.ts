import { describe, expect, it } from 'vitest'
import type { ReasoningContext } from '@op-shared/types'
import { deterministicBrowserReason, deterministicRouteFor } from './deterministic-reasoning'

function context(recentSteps: ReasoningContext['recentSteps'] = []): ReasoningContext {
    return {
        goal: 'Open example.com',
        summary: {
            goalText: 'Open example.com',
            inferredProgress: '',
            completedSubSteps: [],
            updatedThroughIndex: null
        },
        recentSteps,
        currentObservation: {
            id: 'obs',
            screenshotDataUrl: '',
            imageWidth: 1280,
            imageHeight: 800,
            displayId: 0,
            pageText: 'Title: Example Domain\nURL: https://example.com/\n\nExample Domain',
            complete: true,
            capturedAt: '2026-01-01T00:00:00.000Z'
        }
    }
}

describe('deterministic browser reasoning', () => {
    it('recognizes a narrow open-URL goal only in browser mode', () => {
        expect(deterministicRouteFor('Open example.com', 'browser')).toEqual({
            kind: 'open-url',
            url: 'https://example.com/'
        })
        expect(deterministicRouteFor('Open Calculator', 'browser')).toBeNull()
        expect(deterministicRouteFor('Open example.com', 'local')).toBeNull()
    })

    it('opens the URL first and completes after a successful deterministic action', () => {
        expect(deterministicBrowserReason(context(), 'browser')).toMatchObject({
            kind: 'action',
            action: { kind: 'type', text: 'https://example.com/' },
            providerId: 'deterministic-local'
        })

        const after = context([
            {
                index: 0,
                observation: context().currentObservation,
                reasoning: {
                    id: 'r',
                    outcome: 'action',
                    rationale: 'open',
                    providerId: 'deterministic-local',
                    createdAt: '2026-01-01T00:00:00.000Z'
                },
                action: { kind: 'type', text: 'https://example.com/' },
                result: {
                    status: 'success',
                    highRisk: false,
                    mode: 'api',
                    executedAt: '2026-01-01T00:00:01.000Z'
                }
            }
        ])
        expect(deterministicBrowserReason(after, 'browser')).toMatchObject({
            kind: 'completion',
            evidence: 'URL: https://example.com/',
            providerId: 'deterministic-local'
        })
    })
})
