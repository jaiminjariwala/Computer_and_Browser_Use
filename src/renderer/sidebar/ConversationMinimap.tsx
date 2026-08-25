import React from 'react'
import type { TurnView } from '@shared/types'

interface ConversationMinimapProps {
    turns: readonly TurnView[]
    onSelect: (turnIndex: number) => void
}

function compactText(value: string, limit: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (normalized.length <= limit) return normalized
    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function turnPreview(turn: TurnView): { title: string; excerpt: string } {
    const text = turn.text?.trim() ?? ''
    const captureCount = (turn.captures?.length ?? 0) + (turn.capture ? 1 : 0)

    if (turn.role === 'user') {
        return {
            title: compactText(text || 'Attached screenshot', 46),
            excerpt: captureCount > 0
                ? `${captureCount} attached ${captureCount === 1 ? 'image' : 'images'}`
                : 'Your message'
        }
    }

    return {
        title: 'Assistant response',
        excerpt: compactText(text || (captureCount > 0 ? 'Reviewed the attached screen' : 'Response'), 112)
    }
}

/**
 * A compact map of real conversation turns. It stays visually quiet until a
 * marker is hovered or focused, then exposes enough context to navigate.
 */
export function ConversationMinimap({ turns, onSelect }: ConversationMinimapProps): React.JSX.Element | null {
    const entries = turns
        .map((turn, index) => ({ turn, index }))
        .filter(({ turn }) => Boolean(turn.text?.trim() || turn.capture || turn.captures?.length))
        .slice(-30)

    if (entries.length < 2) return null

    return (
        <nav className="conversation-minimap" aria-label="Conversation map">
            {entries.map(({ turn, index }, entryIndex) => {
                const preview = turnPreview(turn)
                return (
                    <button
                        key={turn.id}
                        type="button"
                        className={`conversation-minimap__marker${entryIndex === entries.length - 1 ? ' is-current' : ''}`}
                        onClick={() => onSelect(index)}
                        aria-label={`Jump to ${preview.title}`}
                    >
                        <span className="conversation-minimap__dash" aria-hidden="true" />
                        <span className="conversation-minimap__preview" role="tooltip">
                            <strong>{preview.title}</strong>
                            <span>{preview.excerpt}</span>
                        </span>
                    </button>
                )
            })}
        </nav>
    )
}
