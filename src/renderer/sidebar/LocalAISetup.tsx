import React, { useEffect, useState } from 'react'
import type { LocalAIStatus } from '@shared/local-ai'

export function LocalAISetup(): React.JSX.Element {
    const [status, setStatus] = useState<LocalAIStatus>({phase:'idle', message:'Preparing local AI (~1 GB model plus Ollama)…'})
    useEffect(() => {
        let active = true
        const update = (value: LocalAIStatus): void => { if (active) setStatus(value) }
        const failed = (): void => update({phase:'error', message:'Restart Codex Lite to load local AI setup.'})
        if (typeof window.glass.localAI !== 'function') { failed(); return }
        void window.glass.localAI('prepare').then(update).catch(failed)
        const timer = setInterval(() => { void window.glass.localAI('status').then(update).catch(failed) }, 1000)
        return () => { active = false; clearInterval(timer) }
    }, [])
    const busy = ['idle','installing','starting','downloading'].includes(status.phase)
    return <div className="local-ai-setup" role="status">
        <span>{status.message}{status.percent === undefined ? '' : ` ${status.percent}%`}</span>
        {status.phase !== 'ready' && <button type="button" onClick={() => {
            void window.glass.localAI(busy ? 'pause' : 'start').then(setStatus).catch(() => setStatus({phase:'error',message:'Could not update local AI setup. Restart the app.'}))
        }}>{busy ? 'Pause download' : 'Resume / retry'}</button>}
    </div>
}
