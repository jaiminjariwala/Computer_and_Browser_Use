import React, { useEffect, useRef, useState } from 'react'
import type { BrowserTabState } from '../../shared/browser'
import { WorkspaceIcon } from './WorkspaceIcon'

/** React owns the browser chrome; the main process positions the isolated native page. */
export function BrowserTab({ tab, active }: {tab:BrowserTabState;active:boolean}): React.JSX.Element {
    const [address,setAddress] = useState(tab.url === 'about:blank' ? '' : tab.url)
    const [error,setError] = useState('')
    const slot = useRef<HTMLDivElement>(null)
    const input = useRef<HTMLInputElement>(null)
    useEffect(() => { setAddress(tab.url === 'about:blank' ? '' : tab.url) }, [tab.url])
    useEffect(() => window.browserWorkspace.onFocusAddress(id => { if (id === tab.id) { input.current?.focus(); input.current?.select() } }), [tab.id])
    useEffect(() => {
        let last = ''
        let disposed = false
        const update = (): void => {
            if (disposed) return
            const rect = slot.current?.getBoundingClientRect()
            const blocked = [...document.querySelectorAll('[role="dialog"], [role="menu"]')].some(node => (node as HTMLElement).offsetHeight > 0)
            const bounds = active && !blocked && rect && rect.width > 0 && rect.height > 0 ? {x:rect.x,y:rect.y,width:rect.width,height:rect.height} : null
            const key = JSON.stringify([bounds,tab.url])
            if (key === last) return
            last = key
            void window.browserWorkspace.present(tab.id,bounds).catch(reason => { if (!disposed) setError(String(reason)) })
        }
        const resize = new ResizeObserver(update)
        if (slot.current) resize.observe(slot.current)
        const mutation = new MutationObserver(update)
        mutation.observe(document.body,{childList:true,subtree:true})
        window.addEventListener('resize',update)
        update()
        return () => { disposed = true; resize.disconnect(); mutation.disconnect(); window.removeEventListener('resize',update); void window.browserWorkspace.present(tab.id,null).catch(() => {}) }
    }, [active,tab.id,tab.url])
    const action = (name:'back'|'forward'|'reload'|'stop'): void => { setError(''); void window.browserWorkspace.action(tab.id,name).catch(reason => setError(String(reason))) }
    return <div className="project-browser">
        <form className="project-browser__bar" onSubmit={event => {
            event.preventDefault(); setError('')
            void window.browserWorkspace.navigate(tab.id,address).catch(reason => setError(String(reason)))
        }}>
            <button type="button" aria-label="Back" disabled={!tab.canGoBack} onClick={() => action('back')}>←</button>
            <button type="button" aria-label="Forward" disabled={!tab.canGoForward} onClick={() => action('forward')}>→</button>
            <button type="button" aria-label={tab.loading ? 'Stop loading' : 'Reload page'} onClick={() => action(tab.loading ? 'stop' : 'reload')}>{tab.loading ? '×' : '↻'}</button>
            <input ref={input} aria-label="Search or enter a URL" placeholder="Search or enter a URL" value={address} onChange={event => setAddress(event.target.value)} spellCheck={false} />
            <button aria-label="Go to address">↗</button>
        </form>
        {(error || tab.error) && <p className="project-browser__error" role="alert">{error || tab.error}</p>}
        <div ref={slot} className="project-browser__page">
            {tab.url === 'about:blank' && <div className="project-empty"><WorkspaceIcon name="browser" /><strong>Start browsing</strong><p>Enter a URL or search above. Your agent uses this same browser.</p></div>}
        </div>
    </div>
}
