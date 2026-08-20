import { describe, it, expect } from 'vitest'
import type { TrajectoryStepView, TokenUsage } from '@op-shared/types'
import { describeStep, formatStepUsage, formatSessionUsage } from './operator'

/**
 * Tests for the renderer-side operator formatters that surface observability
 * (per-step and per-session token usage + estimated cost) in the activity log.
 */

const usage = (p: number, c: number): TokenUsage => ({
    promptTokens: p,
    completionTokens: c,
    totalTokens: p + c
})

function step(partial: Partial<TrajectoryStepView>): TrajectoryStepView {
    return {
        index: 0,
        outcome: 'action',
        rationale: 'clicking',
        providerId: 'p1',
        action: { kind: 'left_click', at: { x: 10, y: 20 } },
        capturedAt: '2020-01-01T00:00:00.000Z',
        ...partial
    }
}

describe('formatStepUsage', () => {
    it('is null when no usage is reported', () => {
        expect(formatStepUsage(step({ usage: undefined }))).toBeNull()
    })

    it('shows tokens, cost, and model for a paid model', () => {
        const note = formatStepUsage(step({ usage: usage(1000, 500), model: 'gpt-4o-mini' }))
        expect(note).toContain('tok')
        expect(note).toContain('gpt-4o-mini')
        expect(note).toContain('$')
    })

    it('shows "free" for a known free model', () => {
        const note = formatStepUsage(step({ usage: usage(1000, 500), model: 'gemini-2.5-flash' }))
        expect(note).toContain('free')
    })
})

describe('describeStep meta', () => {
    it('attaches the usage note as meta', () => {
        const item = describeStep(step({ usage: usage(1200, 300), model: 'gpt-4o-mini' }))
        expect(item.meta).toBeTruthy()
        expect(item.meta).toContain('tok')
    })

    it('leaves meta undefined when there is no usage', () => {
        expect(describeStep(step({ usage: undefined })).meta).toBeUndefined()
    })

    it('describes zero-token URL navigation without exposing a path or query', () => {
        const item = describeStep(
            step({
                providerId: 'deterministic-local',
                action: { kind: 'type', text: 'https://example.com/private?token=secret' },
                result: {
                    status: 'success',
                    highRisk: false,
                    mode: 'api',
                    executedAt: '2026-01-01T00:00:00.000Z'
                }
            })
        )
        expect(item.label).toBe('Opened example.com')
        expect(item.label).not.toContain('secret')
    })

    it('shows the verified deterministic completion summary', () => {
        const item = describeStep(
            step({
                outcome: 'completion',
                providerId: 'deterministic-local',
                action: undefined,
                rationale: 'Opened example.com in the sandboxed browser.'
            })
        )
        expect(item.label).toBe('Opened example.com in the sandboxed browser.')
    })
})

describe('formatSessionUsage', () => {
    it('is null without usage', () => {
        expect(formatSessionUsage(undefined, 3)).toBeNull()
    })

    it('summarizes tokens and step count', () => {
        const line = formatSessionUsage(usage(10_000, 2000), 8, 'gpt-4o-mini')
        expect(line).toContain('tokens')
        expect(line).toContain('across 8 steps')
    })

    it('uses singular "step" for a single step', () => {
        expect(formatSessionUsage(usage(100, 50), 1)).toContain('across 1 step')
    })
})
