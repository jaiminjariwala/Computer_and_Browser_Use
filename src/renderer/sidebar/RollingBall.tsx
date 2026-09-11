import React, { useEffect, useState } from 'react'
export function RollingBall({ rolling = false }: { rolling?: boolean }): React.JSX.Element {
    const [src, setSrc] = useState<string>()
    useEffect(() => {
        let active = true
        const refresh = (): void => { void window.glass.dockPreferences().then(value => {
            if (active) setSrc(value.previews[value.icon])
        }).catch(() => undefined) }
        refresh()
        window.addEventListener('dock-icon-changed', refresh)
        return () => { active = false; window.removeEventListener('dock-icon-changed', refresh) }
    }, [])
    return <span className={`rolling-ball${rolling ? ' rolling-ball--moving' : ''}`} aria-hidden="true">{src && <img src={src} alt="" />}</span>
}
