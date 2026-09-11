import { BrowserWindow, session } from 'electron'
import { randomUUID } from 'node:crypto'

/** Dedicated unprivileged search page: no screenshots, local cookies, downloads or app bridge. */
export async function textWebSearch(query: string, signal?: AbortSignal): Promise<string> {
    const isolated = session.fromPartition(`search-${randomUUID()}`)
    isolated.setPermissionRequestHandler((_wc, _permission, done) => done(false))
    isolated.on('will-download', event => event.preventDefault())
    isolated.webRequest.onBeforeRequest((details, done) => {
        const url = new URL(details.url)
        done({ cancel: url.protocol !== 'https:' || !(url.hostname === 'duckduckgo.com' || url.hostname.endsWith('.duckduckgo.com')) })
    })
    const window = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    const recipients = BrowserWindow.getAllWindows().filter(candidate => candidate !== window)
    recipients.forEach(candidate => candidate.webContents.send('search:status', true))
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    let timeout: ReturnType<typeof setTimeout> | undefined
    const cancel = (): void => { if (!window.isDestroyed()) window.destroy() }
    signal?.addEventListener('abort', cancel, { once: true })
    try {
        signal?.throwIfAborted()
        await Promise.race([
            window.loadURL(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.slice(0, 600))}`),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => { cancel(); reject(new Error('Search timed out. Please try again.')) }, 20000) })
        ])
        const results: { title: string; url: string; snippet: string }[] = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.result')).slice(0,5).map(el=>({title:el.querySelector('.result__a')?.textContent||'',url:el.querySelector('.result__a')?.href||'',snippet:el.querySelector('.result__snippet')?.textContent||''}))`)
        const valid = results.flatMap(item => {
            try {
                const link = new URL(item.url)
                const target = new URL(link.searchParams.get('uddg') || item.url)
                if (!['http:', 'https:'].includes(target.protocol) || !item.title) return []
                return [{ title: item.title.slice(0,200), url: target.href, snippet: item.snippet.slice(0,1500) }]
            } catch { return [] }
        })
        if (!valid.length) throw new Error('Search returned no readable results or was blocked. Open DuckDuckGo in the browser to check; no verified web answer is available.')
        return JSON.stringify(valid)
    } finally {
        recipients.forEach(candidate => { if (!candidate.isDestroyed()) candidate.webContents.send('search:status', false) })
        if (timeout) clearTimeout(timeout)
        signal?.removeEventListener('abort', cancel)
        cancel()
        await isolated.clearStorageData()
    }
}
