import React from 'react'
import { WorkspaceIcon } from './WorkspaceIcon'

/** Compact file-type badges; the adjacent filename supplies the accessible label. */
export function FileTypeIcon({ path }: { path: string }): React.JSX.Element {
    const extension = path.split('.').pop()?.toLowerCase() ?? ''
    const badges: Record<string, [string, string]> = {
        ts: ['TS', '#3188cf'], tsx: ['⚛', '#3188cf'], js: ['JS', '#b58b00'],
        mjs: ['JS', '#b58b00'], cjs: ['JS', '#b58b00'], jsx: ['⚛', '#3188cf'],
        json: ['{}', '#d77937'], css: ['#', '#9661cc'], html: ['<>', '#d77937'],
        md: ['M↓', '#26964f'], sh: ['$_', '#26964f'], py: ['Py', '#3188cf'],
        go: ['Go', '#1a9cb0'], yml: ['Y', '#cb6377'], yaml: ['Y', '#cb6377'],
        png: ['▧', '#cb6377'], jpg: ['▧', '#cb6377'], svg: ['▧', '#cb6377'],
        gitignore: ['◇', '#d77937']
    }
    const badge = badges[extension]
    return badge ? <span className="file-type-icon" style={{ color: badge[1] }} aria-hidden="true">{badge[0]}</span> : <WorkspaceIcon name="file" />
}
