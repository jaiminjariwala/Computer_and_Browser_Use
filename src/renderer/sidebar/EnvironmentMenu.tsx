import React from 'react'
import type { WorkspaceContext } from '@shared/types'

export interface EnvironmentSource {
    id: string
    name: string
    thumbnailUrl?: string
    detail?: string
}

function Glyph({ kind }: { kind: 'changes' | 'branch' | 'commit' | 'source' }): React.JSX.Element {
    const path: Record<typeof kind, React.ReactNode> = {
        changes: <><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 8h6M12 5v6M9 16h6" /></>,
        branch: <><circle cx="7" cy="5" r="2" /><circle cx="17" cy="8" r="2" /><circle cx="7" cy="19" r="2" /><path d="M7 7v10M9 10c4 0 4-2 6-2" /></>,
        commit: <><path d="M2 12h6M16 12h6" /><circle cx="12" cy="12" r="4" /></>,
        source: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m7 16 3-3 3 3 4-5 2 3" /></>
    }
    return <svg viewBox="0 0 24 24" aria-hidden="true">{path[kind]}</svg>
}

export function EnvironmentMenu({
    workspace,
    sources,
    onOpenChanges,
    onOpenDetails,
    onOpenSource
}: {
    workspace: WorkspaceContext | null
    sources: EnvironmentSource[]
    onOpenChanges: () => void
    onOpenDetails: (title: string, rows: Array<{ label: string; value: string }>) => void
    onOpenSource: (source: EnvironmentSource) => void
}): React.JSX.Element {
    const context = workspace
    return (
        <div className="environment-card" role="region" aria-label="Environment and sources">
            <div className="environment-card__title"><span>Environment</span><span>+</span></div>
            <button type="button" onClick={onOpenChanges}><Glyph kind="changes" /><span>Changes</span><span className="environment-card__counts"><b>+{context?.additions ?? 0}</b> <i>−{context?.deletions ?? 0}</i></span></button>
            <button type="button" onClick={() => onOpenDetails('Task branch', [{ label: 'Current branch', value: context?.branch || 'No task branch attached' }, { label: 'Ahead', value: String(context?.ahead ?? 0) }, { label: 'Behind', value: String(context?.behind ?? 0) }])}><Glyph kind="branch" /><span>{context?.branch || 'No branch'}</span><span className="environment-card__chevron">›</span></button>
            <button type="button" onClick={() => onOpenDetails('Commit or push', [{ label: 'Last task commit', value: context?.lastCommit || 'No task commit yet' }, { label: 'Task files changed', value: String(context?.changedFiles ?? 0) }, { label: 'Commits to push', value: String(context?.ahead ?? 0) }])}><Glyph kind="commit" /><span>Commit or push</span><span className="environment-card__chevron">›</span></button>
            <div className="environment-card__section"><span>Sources</span><span>+</span></div>
            {sources.slice(0, 3).map((source) => <button type="button" key={source.id} onClick={() => onOpenSource(source)}>{source.thumbnailUrl ? <img className="environment-card__source-thumb" src={source.thumbnailUrl} alt="" /> : <Glyph kind="source" />}<span className="environment-card__source-name">{source.name}</span><span className="environment-card__chevron">›</span></button>)}
            {sources.length > 3 && <button type="button" onClick={() => onOpenDetails('Sources', sources.map((source) => ({ label: source.name, value: source.detail ?? 'Attached to this chat' })))}><Glyph kind="source" /><span>View all</span><span>{sources.length}</span></button>}
        </div>
    )
}
