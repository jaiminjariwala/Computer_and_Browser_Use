import { describe, expect, it } from 'vitest'
import { curateForMode } from './models'

describe('model availability curation', () => {
    it('does not advertise offline provider defaults as connected models', () => {
        expect(curateForMode(false, [], {
            gateway: false,
            gemini: false,
            openrouter: false
        }).recommended).toEqual([])
    })

    it('shows only providers that are actually connected', () => {
        const curated = curateForMode(false, [], {
            gateway: false,
            gemini: true,
            openrouter: false
        })
        expect(curated.recommended.map((model) => model.id)).toEqual(['gemini-2.5-flash'])
    })
})
