import { describe, expect, it } from 'vitest'
import { isWorkspaceTask, routeIntent } from './intentRouter'

describe('coding questions', () => {
    it('does not treat action words inside quoted prose as automation', () => {
        expect(routeIntent("there was a time when people said xyz won't make it but we did. tell me which country's anthem is this? fill xyz with the country name", false)).toEqual({ mode: 'copilot' })
        expect(routeIntent('please open youtube', false)).toEqual({ mode: 'operator', environment: 'browser' })
    })
    it('keeps LeetCode answers in chat', () => {
        const text = 'Give me LeetCode rotting oranges problem code in Python'
        expect(isWorkspaceTask(text)).toBe(false)
        expect(routeIntent(text, false)).toEqual({ mode: 'copilot' })
    })
    it('retains explicit project tasks', () => {
        expect(isWorkspaceTask('Build a React app in this project')).toBe(true)
    })
})
