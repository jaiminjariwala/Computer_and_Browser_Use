import { describe, expect, it } from 'vitest'
import { zeroCostChatReply } from './local-chat'

describe('zeroCostChatReply', () => {
    it('answers simple greetings without a provider call', () => {
        expect(zeroCostChatReply('hi how are you?')).toContain('doing well')
        expect(zeroCostChatReply('how are you ?')).toContain('doing well')
        expect(zeroCostChatReply('Hello!')).toContain('help you')
    })

    it('does not pretend to answer substantive prompts locally', () => {
        expect(zeroCostChatReply('Explain OAuth token exchange')).toBeNull()
    })
})
