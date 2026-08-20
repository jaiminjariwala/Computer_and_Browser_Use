import { describe, expect, it } from 'vitest'
import { activeStepLabel, environmentTitle } from './TaskActivity'

describe('task activity presentation', () => {
    it('uses clear environment and live-state labels', () => {
        expect(environmentTitle('local')).toBe('Working on Your Mac')
        expect(environmentTitle('container-desktop')).toBe('Working in Sandboxed Desktop')
        expect(activeStepLabel('awaiting-confirmation')).toBe('Waiting for your approval')
        expect(activeStepLabel('perceiving')).toBe('Inspecting the current screen')
    })
})
