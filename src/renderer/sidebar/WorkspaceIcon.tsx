import React from 'react'

export type WorkspaceIconName = 'files' | 'file' | 'review' | 'terminal' | 'browser' | 'close' | 'refresh' | 'chevron'

/** Shared outline icons for workspace tabs, menus, and the file explorer. */
export function WorkspaceIcon({ name }: { name: WorkspaceIconName }): React.JSX.Element {
    const paths: Record<WorkspaceIconName, React.ReactNode> = {
        files: <><path d="M9 5V4a2 2 0 0 1 2-2h3l2 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><path d="M2 9a2 2 0 0 1 2-2h4l2 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" /></>,
        file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
        review: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M12 7v6M9 10h6M9 17h6" /></>,
        terminal: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m7 8 4 4-4 4m7 0h3" /></>,
        browser: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
        close: <path d="m6 6 12 12M6 18 18 6" />,
        refresh: <><path d="M20 7v5h-5" /><path d="M20 12a8 8 0 1 0-2 5M20 7l-2-2" /></>,
        chevron: <path d="m9 5 7 7-7 7" />
    }
    return <svg className="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
