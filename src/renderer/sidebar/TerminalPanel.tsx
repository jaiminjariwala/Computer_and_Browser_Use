import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { TerminalCommandResult } from '@shared/types'
import { getChatBridge } from './bridges'

interface TerminalEntry extends TerminalCommandResult {
    id: string
}

function TerminalGlyph(): React.JSX.Element {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="3" /><path d="m6 8 2 2-2 2M10.5 12h3.5" /></svg>
}

function cwdLabel(cwd: string | undefined): string {
    if (!cwd) return 'task-workspace'
    return cwd.split('/').filter(Boolean).pop() || 'task-workspace'
}

export function TerminalPanel({ title, onClose }: { title: string; onClose: () => void }): React.JSX.Element {
    const [command, setCommand] = useState('')
    const [entries, setEntries] = useState<TerminalEntry[]>([])
    const [running, setRunning] = useState(false)
    const [height, setHeight] = useState(() => {
        const saved = Number(localStorage.getItem('terminal-panel-height'))
        return Number.isFinite(saved) && saved >= 145 ? saved : 245
    })
    const outputRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        localStorage.setItem('terminal-panel-height', String(height))
    }, [height])

    const beginResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        const startY = event.clientY
        const startHeight = height
        document.body.classList.add('is-resizing-terminal')

        const onMove = (moveEvent: PointerEvent): void => {
            const availableHeight = Math.max(180, window.innerHeight - 150)
            const nextHeight = Math.min(availableHeight, Math.max(145, startHeight + startY - moveEvent.clientY))
            setHeight(Math.round(nextHeight))
        }
        const onUp = (): void => {
            document.body.classList.remove('is-resizing-terminal')
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }, [height])

    useEffect(() => {
        outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
    }, [entries, running])

    const submit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault()
        const value = command.trim()
        const bridge = getChatBridge()
        if (!value || !bridge?.runTerminalCommand || running) return
        setCommand('')
        setRunning(true)
        try {
            const result = await bridge.runTerminalCommand(value)
            setEntries((current) => [...current, { ...result, id: `${Date.now()}-${current.length}` }])
        } catch (error) {
            setEntries((current) => [...current, {
                id: `${Date.now()}-${current.length}`,
                command: value,
                output: error instanceof Error ? error.message : String(error),
                exitCode: 1,
                cwd: ''
            }])
        } finally {
            setRunning(false)
        }
    }

    return (
        <section className="terminal-panel" aria-label="Terminal" style={{ height, flexBasis: height }}>
            <div
                className="terminal-panel__resizer"
                role="separator"
                aria-label="Resize terminal panel"
                aria-orientation="horizontal"
                aria-valuemin={145}
                aria-valuenow={height}
                onPointerDown={beginResize}
                onDoubleClick={onClose}
            />
            <header className="terminal-panel__tabs">
                <div className="terminal-panel__tab"><TerminalGlyph /><strong>{title || 'Task terminal'}</strong><button type="button" onClick={onClose} aria-label="Close terminal tab">×</button></div>
                <button type="button" className="terminal-panel__add" aria-label="New terminal" title="New terminal">+</button>
                <button type="button" className="terminal-panel__close" onClick={onClose} aria-label="Close terminal panel" title="Close terminal panel">×</button>
            </header>
            <div className="terminal-panel__output" ref={outputRef}>
                {entries.map((entry) => (
                    <div className="terminal-entry" key={entry.id}>
                        <div><span>{cwdLabel(entry.cwd)}</span> % {entry.command}</div>
                        {entry.output && <pre>{entry.output}</pre>}
                        {entry.exitCode !== 0 && <small>Exited with code {entry.exitCode}</small>}
                    </div>
                ))}
                {running && <div className="terminal-panel__running">Running…</div>}
                <form className="terminal-panel__prompt" onSubmit={(event) => void submit(event)}>
                    <span>{cwdLabel(entries.at(-1)?.cwd)} %</span>
                    <input autoFocus value={command} onChange={(event) => setCommand(event.target.value)} aria-label="Terminal command" autoComplete="off" spellCheck={false} />
                </form>
            </div>
        </section>
    )
}
