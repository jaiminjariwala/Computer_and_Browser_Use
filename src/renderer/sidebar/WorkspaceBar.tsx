import React from 'react'

function PanelIcon({ side }: { side: 'left' | 'right' | 'bottom' }): React.JSX.Element {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            {side === 'left' && <path d="M9 4v16" />}
            {side === 'right' && <path d="M15 4v16" />}
            {side === 'bottom' && <path d="M3 14h18" />}
        </svg>
    )
}

export function WorkspaceBar({
    rightOpen,
    terminalOpen,
    onToggleNav,
    onToggleRight,
    onToggleTerminal
}: {
    rightOpen: boolean
    terminalOpen: boolean
    onToggleNav: () => void
    onToggleRight: () => void
    onToggleTerminal: () => void
}): React.JSX.Element {
    return (
        <header className="workspace-bar">
            <div className="workspace-bar__left">
                <button type="button" className="workspace-bar__nav-toggle" onClick={onToggleNav} aria-label="Toggle chat sidebar" title="Toggle chat sidebar">
                    <PanelIcon side="left" />
                </button>
            </div>
            <div className="workspace-bar__actions">
                <button type="button" className={terminalOpen ? 'is-active' : ''} onClick={onToggleTerminal} aria-label="Toggle bottom terminal" title="Toggle bottom terminal (⌘J)">
                    <PanelIcon side="bottom" />
                </button>
                <button type="button" className={rightOpen ? 'is-active' : ''} onClick={onToggleRight} aria-label="Toggle Environment panel" title="Toggle Environment panel">
                    <PanelIcon side="right" />
                </button>
            </div>
        </header>
    )
}
