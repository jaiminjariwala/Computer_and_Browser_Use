import React, { useCallback, useEffect } from 'react'

export type InspectorArtifact =
    | { kind: 'details'; title: string; subtitle?: string; rows: Array<{ label: string; value: string }> }
    | { kind: 'source'; title: string; imageUrl?: string; detail?: string }
    | { kind: 'computer-use'; title: string; imageUrl?: string; environment: string; running: boolean }

export function InspectorPanel({
    artifact,
    onClose,
    width,
    onResize
}: {
    artifact: InspectorArtifact
    onClose: () => void
    width: number
    onResize: (width: number) => void
}): React.JSX.Element {
    const startResize = useCallback((event: React.PointerEvent) => {
        event.preventDefault()
        const move = (next: PointerEvent): void => {
            const max = Math.max(360, window.innerWidth - 360)
            onResize(Math.min(max, Math.max(320, window.innerWidth - next.clientX)))
        }
        const up = (): void => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
    }, [onResize])

    useEffect(() => {
        const close = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', close)
        return () => window.removeEventListener('keydown', close)
    }, [onClose])

    return (
        <aside className="code-panel inspector-panel" aria-label={`${artifact.title} inspector`} style={{ width }}>
            <div className="code-panel__resizer" onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label="Resize inspector" />
            <header className="inspector-panel__header">
                <div>
                    <h2>{artifact.title}</h2>
                    {'subtitle' in artifact && artifact.subtitle && <p>{artifact.subtitle}</p>}
                </div>
                <button type="button" className="code-fab" onClick={onClose}>Close</button>
            </header>
            <div className="inspector-panel__body">
                {artifact.kind === 'details' && (
                    <dl className="inspector-details">
                        {artifact.rows.map((row) => (
                            <div key={`${row.label}-${row.value}`}>
                                <dt>{row.label}</dt>
                                <dd>{row.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                {artifact.kind === 'source' && (
                    <>
                        {artifact.imageUrl ? <img className="inspector-preview" src={artifact.imageUrl} alt={artifact.title} /> : <div className="inspector-empty">Preview unavailable</div>}
                        {artifact.detail && <p className="inspector-caption">{artifact.detail}</p>}
                    </>
                )}
                {artifact.kind === 'computer-use' && (
                    <>
                        <div className="inspector-live"><span className={artifact.running ? 'is-live' : ''} />{artifact.running ? 'Live' : 'Last view'} · {artifact.environment}</div>
                        {artifact.imageUrl ? <img className="inspector-preview" src={artifact.imageUrl} alt="Computer Use preview" /> : <div className="inspector-empty">The preview appears when Computer Use inspects its environment.</div>}
                    </>
                )}
            </div>
        </aside>
    )
}
