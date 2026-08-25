import React, { useCallback, useEffect, useState } from 'react'
import Editor, { type BeforeMount } from '@monaco-editor/react'
import { MONACO_THEME, ensureCopilotTheme } from './monacoSetup'
import { languageLabel, monacoLanguage } from './codeTheme'
import type { CodeArtifact } from './codePanelContext'

interface DiffFile {
    name: string
    lines: string[]
    additions: number
    deletions: number
}

function parseUnifiedDiff(diff: string): DiffFile[] {
    const files: DiffFile[] = []
    let current: DiffFile | null = null
    for (const line of diff.split('\n')) {
        if (line.startsWith('diff --git ')) {
            const match = line.match(/^diff --git a\/(.+) b\/(.+)$/)
            current = { name: match?.[2] ?? 'Changed file', lines: [], additions: 0, deletions: 0 }
            files.push(current)
            continue
        }
        if (!current) continue
        if (line.startsWith('+') && !line.startsWith('+++')) current.additions += 1
        if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1
        current.lines.push(line)
    }
    return files
}

function DiffLine({ line }: { line: string }): React.JSX.Element {
    const kind = line.startsWith('+') && !line.startsWith('+++')
        ? 'add'
        : line.startsWith('-') && !line.startsWith('---')
            ? 'remove'
            : line.startsWith('@@')
                ? 'hunk'
                : line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')
                    ? 'meta'
                    : 'context'
    return <div className={`review-line review-line--${kind}`}><code>{line || ' '}</code></div>
}

/**
 * The Claude-style right-hand code panel, backed by Monaco and styled to match
 * the component-library CodeModal: language pill(s) floating at the top-left and
 * text-only "Copy" / close pill buttons at the top-right, over a read-only
 * Monaco editor using the light "copilot-light" theme.
 */
export function CodePanel({
    artifact,
    onClose,
    width,
    onResize
}: {
    artifact: CodeArtifact
    onClose: () => void
    /** Current panel width in px. */
    width: number
    /** Called with a new width while the user drags the left edge. */
    onResize: (width: number) => void
}): React.JSX.Element {
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        setCopied(false)
    }, [artifact])

    // Drag the left edge to resize the panel width. Clamped so both the chat and
    // the panel stay usable.
    const startResize = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault()
            const onMove = (ev: PointerEvent): void => {
                const next = window.innerWidth - ev.clientX
                const max = Math.max(360, window.innerWidth - 360)
                onResize(Math.min(max, Math.max(320, next)))
            }
            const onUp = (): void => {
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
            }
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
        },
        [onResize]
    )

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const onCopy = useCallback(() => {
        void navigator.clipboard.writeText(artifact.code).then(
            () => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
            },
            () => undefined
        )
    }, [artifact.code])

    const beforeMount: BeforeMount = (monaco) => {
        ensureCopilotTheme(monaco)
        const diag = { noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true }
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diag)
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diag)
    }

    const diffFiles = artifact.language === 'diff' ? parseUnifiedDiff(artifact.code) : []
    const additions = diffFiles.reduce((sum, file) => sum + file.additions, 0)
    const deletions = diffFiles.reduce((sum, file) => sum + file.deletions, 0)

    return (
        <aside
            className="code-panel"
            aria-label="Code viewer"
            style={{ flex: '0 0 auto', width: `${width}px` }}
        >
            {/* Drag handle on the left edge to resize the panel width. */}
            <div
                className="code-panel__resizer"
                onPointerDown={startResize}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize code panel"
            />
            {artifact.language !== 'diff' && (
                <div className="code-pills">
                    <span className="code-pill">{languageLabel(artifact.language)}</span>
                    {artifact.title && <span className="code-pill">{artifact.title}</span>}
                </div>
            )}

            {artifact.language === 'diff' && (
                <div className="review-tabs" role="tablist" aria-label="Workspace tabs">
                    <div className="review-tabs__tab" role="tab" aria-selected="true">
                        <span className="review-tabs__icon">▣</span>
                        <span>Review</span>
                        <button type="button" onClick={onClose} aria-label="Close Review">×</button>
                    </div>
                    <button type="button" className="review-tabs__add" aria-label="New workspace tab">+</button>
                </div>
            )}

            {/* Floating text-only buttons, top-right. */}
            {artifact.language !== 'diff' && <div className="code-fabs">
                <button type="button" className="code-fab" onClick={onCopy}>
                    {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                    type="button"
                    className="code-fab"
                    onClick={onClose}
                    aria-label="Close code panel"
                    title="Close"
                >
                    Close
                </button>
            </div>}

            <div className="code-panel__body">
                {artifact.language === 'diff' ? (
                    <div className="review-panel" aria-label="Changes review">
                        <header className="review-panel__header">
                            <div><strong>Branch</strong><span>Task changes</span></div>
                            <div className="review-panel__totals"><b>+{additions.toLocaleString()}</b><i>−{deletions.toLocaleString()}</i></div>
                        </header>
                        <div className="review-panel__branches"><strong>Task workspace</strong><span>→</span><span>generated result</span></div>
                        {diffFiles.length === 0 ? (
                            <div className="review-panel__empty"><strong>No task changes yet</strong><span>Files generated or edited by this chat will appear here. This app's own source changes are intentionally excluded.</span></div>
                        ) : diffFiles.map((file) => (
                            <section className="review-file" key={file.name}>
                                <header><strong>{file.name}</strong><span><b>+{file.additions}</b> <i>−{file.deletions}</i></span></header>
                                <div className="review-file__code">{file.lines.map((line, index) => <DiffLine key={`${file.name}-${index}`} line={line} />)}</div>
                            </section>
                        ))}
                    </div>
                ) : <Editor
                    key={artifact.language + '-' + artifact.code.length}
                    height="100%"
                    theme={MONACO_THEME}
                    language={monacoLanguage(artifact.language)}
                    value={artifact.code}
                    beforeMount={beforeMount}
                    loading={<div className="code-panel__loading">Loading editor…</div>}
                    options={{
                        readOnly: true,
                        domReadOnly: true,
                        automaticLayout: true,
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        lineNumbersMinChars: 3,
                        glyphMargin: false,
                        folding: false,
                        renderLineHighlight: 'none',
                        scrollBeyondLastLine: false,
                        overviewRulerBorder: false,
                        hideCursorInOverviewRuler: true,
                        fontFamily:
                            '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace',
                        fontSize: 14,
                        lineHeight: 26,
                        wordWrap: 'off',
                        tabSize: 2,
                        stickyScroll: { enabled: false },
                        // Top padding clears the floating pill/buttons toolbar.
                        padding: { top: 64, bottom: 28 },
                        smoothScrolling: true,
                        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                        contextmenu: false
                    }}
                />}
            </div>
        </aside>
    )
}
