import { describe, expect, it } from 'vitest'
import { isWorkspaceTask, routeIntent } from './intentRouter'

describe('coding questions', () => {
    it('keeps LeetCode answers in chat', () => {
        const text = 'Give me LeetCode rotting oranges problem code in Python'
        expect(isWorkspaceTask(text)).toBe(false)
        expect(routeIntent(text, false)).toEqual({ mode: 'copilot' })
    })
    it('retains explicit project tasks', () => {
        expect(isWorkspaceTask('Build a React app in this project')).toBe(true)
    })
})
