import { WebContentsView, session, ipcMain, type BrowserWindow, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import type { BrowserBounds, BrowserSnapshot, BrowserTabState } from '../shared/browser'
import { allowedBrowserNavigation, browserAddress } from './browser-url'

interface Tab { id: string; view: WebContentsView; error?: string }

/** Owns browser pages; remote content never receives the app's preload/IPC bridge. */
export class EmbeddedBrowser {
    private tabs = new Map<string, Tab>()
    private selectedId: string | null = null
    private presentedId: string | null = null
    private generation = 0
    private session = session.fromPartition('persist:workspace-browser')
    constructor(private readonly host: () => BrowserWindow | null) {
        this.session.setPermissionCheckHandler(() => false)
        this.session.setPermissionRequestHandler((contents, permission, callback) => {
            callback(false)
            const tab = [...this.tabs.values()].find(item => item.view.webContents === contents)
            if (tab) { tab.error = `This site requested ${permission}. Site permissions are not enabled in this browser yet.`; this.publish() }
        })
        this.session.on('will-download', (_event, item) => {
            // Let Electron show its native Save dialog; never silently execute downloads.
            item.setSaveDialogOptions({ title: 'Save browser download' })
        })
        host()?.on('closed', () => this.dispose())
        host()?.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
            if (mainFrame) this.hideAll()
        })
    }
    snapshot(focusId?: string): BrowserSnapshot {
        return { selectedId: this.selectedId, tabs: [...this.tabs.values()].map(tab => this.describe(tab)), ...(focusId ? {focusId} : {}) }
    }
    private describe(tab: Tab): BrowserTabState {
        const wc = tab.view.webContents
        return { id: tab.id, title: wc.getTitle() || 'New tab', url: wc.getURL() || 'about:blank', loading: wc.isLoading(), canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward(), error: tab.error }
    }
    private publish(focusId?: string): void {
        const host = this.host()
        if (host && !host.isDestroyed() && !host.webContents.isDestroyed()) host.webContents.send('browser:changed', this.snapshot(focusId))
    }
    private tab(id: string): Tab {
        const tab = this.tabs.get(id)
        if (!tab || tab.view.webContents.isDestroyed()) throw new Error('Browser tab is closed.')
        return tab
    }
    create(url = 'about:blank'): BrowserTabState {
        if (this.tabs.size >= 12) throw new Error('Close a browser tab before opening another (12-tab limit).')
        if (!allowedBrowserNavigation(url)) throw new Error('Unsupported browser address.')
        const host = this.host()
        if (!host || host.isDestroyed()) throw new Error('App window is closed.')
        const view = new WebContentsView({ webPreferences: {
            session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true,
            webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
            navigateOnDragDrop: false, spellcheck: true
        } })
        const tab: Tab = { id: randomUUID(), view }
        this.tabs.set(tab.id, tab)
        host.contentView.addChildView(view)
        view.setVisible(false)
        const wc = view.webContents
        const guard = (event: Electron.Event, target: string): void => {
            if (!allowedBrowserNavigation(target)) { event.preventDefault(); tab.error = 'This browser blocks non-web addresses.'; this.publish() }
        }
        wc.on('will-navigate', guard)
        wc.on('will-redirect', guard)
        wc.on('will-frame-navigate', (event) => guard(event, event.url))
        wc.setWindowOpenHandler(({url}) => {
            if (allowedBrowserNavigation(url)) {
                try { this.create(url) } catch (error) { tab.error = String(error); this.publish() }
            }
            return {action:'deny'}
        })
        wc.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) { this.generation++; tab.error = undefined } this.publish() })
        wc.on('page-title-updated', () => this.publish())
        wc.on('did-navigate', () => this.publish())
        wc.on('did-navigate-in-page', () => this.publish())
        wc.on('did-start-loading', () => this.publish())
        wc.on('did-stop-loading', () => this.publish())
        wc.on('before-mouse-event', (_event, input) => { if (input.type !== 'mouseMove') this.generation++ })
        wc.on('did-fail-load', (_event, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) { tab.error = `Page could not load: ${description}`; this.publish() } })
        wc.on('render-process-gone', () => { tab.error = 'This page stopped responding. Reload to try again.'; this.generation++; this.publish() })
        wc.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return
            this.generation++
            const primary = input.meta || input.control
            if (primary && ['t','w','l','r'].includes(input.key.toLowerCase())) {
                event.preventDefault()
                const key = input.key.toLowerCase()
                if (key === 't') { try { this.create() } catch { /* tab limit */ } }
                if (key === 'w') this.close(tab.id)
                if (key === 'r') wc.reload()
                if (key === 'l') { this.focus(tab.id); this.host()?.webContents.focus(); this.host()?.webContents.send('browser:focus-address', tab.id) }
            }
        })
        this.focus(tab.id)
        void wc.loadURL(url).catch(error => { if (this.tabs.has(tab.id)) { tab.error = String(error); this.publish() } })
        return this.describe(tab)
    }
    focus(id: string): void {
        this.tab(id)
        if (this.selectedId !== id) this.generation++
        this.selectedId = id
        this.publish(id)
    }
    async ensureActive(): Promise<void> {
        const id = this.selectedId && this.tabs.has(this.selectedId) ? this.selectedId : this.create().id
        this.focus(id)
        const deadline = Date.now() + 5000
        while (this.presentedId !== id && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
        if (this.presentedId !== id) throw new Error('Open the Browser tab in the right workspace to let the agent use it.')
    }
    close(id: string): void {
        const tab = this.tab(id)
        this.tabs.delete(id)
        this.host()?.contentView.removeChildView(tab.view)
        tab.view.webContents.close()
        this.generation++
        if (this.presentedId === id) this.presentedId = null
        if (this.selectedId === id) this.selectedId = [...this.tabs.keys()].at(-1) ?? null
        this.publish(this.selectedId ?? undefined)
    }
    async navigate(id: string, address: string): Promise<void> {
        const tab = this.tab(id)
        const url = browserAddress(address)
        tab.error = undefined
        this.generation++
        try { await tab.view.webContents.loadURL(url) } catch (error) {
            if (tab.view.webContents.isDestroyed()) return
            if (!String(error).includes('ERR_ABORTED')) { tab.error = String(error); this.publish(); throw error }
        }
        this.publish()
    }
    action(id: string, action: string): void {
        const wc = this.tab(id).view.webContents
        if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
        else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
        else if (action === 'reload') wc.reload()
        else if (action === 'stop') wc.stop()
        else if (!['back','forward'].includes(action)) throw new Error('Unknown browser action.')
        this.generation++
    }
    present(id: string, bounds: BrowserBounds | null): void {
        const tab = this.tab(id)
        if (!bounds) {
            tab.view.setVisible(false)
            if (this.presentedId === id) { this.presentedId = null; this.generation++ }
            return
        }
        const host = this.host()
        if (!host || Object.values(bounds).some(value => !Number.isFinite(value))) throw new Error('Invalid browser bounds.')
        const factor = host.webContents.getZoomFactor()
        const [w,h] = host.getContentSize()
        const x = Math.max(0, Math.round(bounds.x * factor)), y = Math.max(38, Math.round(bounds.y * factor))
        const width = Math.max(0, Math.min(w-x, Math.round(bounds.width * factor)))
        const height = Math.max(0, Math.min(h-y, Math.round(bounds.height * factor)))
        if (!width || !height) { this.present(id, null); return }
        for (const other of this.tabs.values()) if (other.id !== id) other.view.setVisible(false)
        const previous = tab.view.getBounds()
        if (this.presentedId !== id || previous.width !== width || previous.height !== height) this.generation++
        this.presentedId = id
        this.selectedId = id
        tab.view.setBounds({x,y,width,height})
        tab.view.setVisible(tab.view.webContents.getURL() !== 'about:blank' && !!tab.view.webContents.getURL())
    }
    active(): {id: string; contents: WebContents; epoch: number; bounds: BrowserBounds} | null {
        if (!this.presentedId || this.presentedId !== this.selectedId) return null
        const tab = this.tabs.get(this.presentedId)
        if (!tab || tab.view.webContents.isDestroyed()) return null
        return {id:tab.id, contents:tab.view.webContents, epoch:this.generation, bounds:tab.view.getBounds()}
    }
    hideAll(): void { for (const tab of this.tabs.values()) tab.view.setVisible(false); this.presentedId = null; this.generation++ }
    stopNavigation(): void { for (const tab of this.tabs.values()) tab.view.webContents.stop(); this.generation++ }
    dispose(): void { for (const tab of this.tabs.values()) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); this.tabs.clear(); this.presentedId = null }
}

export function registerBrowserIpc(browser: EmbeddedBrowser, host: () => BrowserWindow | null): void {
    const handlers: Record<string, (p: any) => unknown> = {
        list: () => browser.snapshot(), create: () => browser.create(), close: id => browser.close(id),
        navigate: p => browser.navigate(p.id,p.address), action: p => browser.action(p.id,p.action), present: p => browser.present(p.id,p.bounds)
    }
    for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`browser:${name}`, (event,payload) => {
        const wc = host()?.webContents
        if (!wc || event.sender !== wc || event.senderFrame !== wc.mainFrame) throw new Error('Browser controls are only available to the app workspace.')
        return handler(payload)
    })
}
