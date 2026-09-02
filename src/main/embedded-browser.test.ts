import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks = vi.hoisted(() => ({views:[] as any[], handlers:new Map<string,any>(), partition:vi.fn(), permission:vi.fn(), permissionCheck:vi.fn()}))
vi.mock('electron', () => ({
    session:{fromPartition:(name:string) => {mocks.partition(name); return {setPermissionCheckHandler:mocks.permissionCheck,setPermissionRequestHandler:mocks.permission,on:vi.fn()}}},
    ipcMain:{handle:(name:string,fn:unknown) => mocks.handlers.set(name,fn)},
    WebContentsView:class {
        bounds = {x:0,y:0,width:800,height:600}; visible=false; options:unknown
        webContents:any
        constructor(options:unknown) {
            this.options=options
            const events = new Map<string,Function>()
            let url='about:blank'
            this.webContents={on:(event:string,fn:Function)=>events.set(event,fn),events,getURL:()=>url,getTitle:()=>'',isLoading:()=>false,isDestroyed:()=>false,
                navigationHistory:{canGoBack:()=>true,canGoForward:()=>false,goBack:vi.fn(),goForward:vi.fn()},
                setWindowOpenHandler:vi.fn(),loadURL:vi.fn(async (value:string)=>{url=value}),close:vi.fn(),reload:vi.fn(),stop:vi.fn()}
            mocks.views.push(this)
        }
        setBounds(value:any){this.bounds=value} getBounds(){return this.bounds} setVisible(value:boolean){this.visible=value}
    }
}))
import {EmbeddedBrowser,registerBrowserIpc} from './embedded-browser'
import {browserAddress,allowedBrowserNavigation} from './browser-url'
import type {BrowserWindow} from 'electron'

describe('embedded browser', () => {
    beforeEach(()=>{mocks.views.length=0;mocks.handlers.clear();vi.clearAllMocks()})
    function setup(){
        const wc={mainFrame:{},isDestroyed:()=>false,send:vi.fn(),on:vi.fn(),getZoomFactor:()=>1}
        const host={webContents:wc,on:vi.fn(),isDestroyed:()=>false,getContentSize:()=>[1200,800],contentView:{addChildView:vi.fn(),removeChildView:vi.fn()}}
        const browser=new EmbeddedBrowser(()=>host as unknown as BrowserWindow)
        return {browser,host,wc}
    }
    it('accepts URLs, bare domains, localhost, and ordinary searches',()=>{
        expect(browserAddress('youtube.com')).toBe('https://youtube.com/')
        expect(browserAddress('localhost:3000')).toBe('http://localhost:3000/')
        expect(browserAddress('rocket animation tutorials')).toBe('https://www.google.com/search?q=rocket%20animation%20tutorials')
        for(const address of ['javascript:alert(1)','file:///etc/passwd','data:text/html,hi','https://user:password@example.com']) expect(()=>browserAddress(address)).toThrow()
        expect(allowedBrowserNavigation('file:///tmp/index.html')).toBe(false)
    })
    it('isolates pages from Node and preload with a separate persisted partition',()=>{
        const {browser}=setup();browser.create()
        expect(mocks.partition).toHaveBeenCalledWith('persist:workspace-browser')
        expect(mocks.views[0].options.webPreferences).toMatchObject({sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true})
        expect(mocks.views[0].options.webPreferences.preload).toBeUndefined()
        expect(mocks.permissionCheck.mock.calls[0][0]()).toBe(false)
    })
    it('keeps popups in embedded tabs and blocks file/script navigation',()=>{
        const {browser}=setup();browser.create()
        const open=mocks.views[0].webContents.setWindowOpenHandler.mock.calls[0][0]
        expect(open({url:'https://example.com'})).toEqual({action:'deny'})
        expect(browser.snapshot().tabs).toHaveLength(2)
        open({url:'file:///secret'});expect(browser.snapshot().tabs).toHaveLength(2)
        const event={preventDefault:vi.fn()}
        mocks.views[0].webContents.events.get('will-navigate')(event,'javascript:alert(1)')
        expect(event.preventDefault).toHaveBeenCalled()
    })
    it('invalidates observations when tabs hide, resize, or switch',()=>{
        const {browser}=setup();const a=browser.create();browser.present(a.id,{x:500,y:120,width:700,height:600})
        const first=browser.active()!.epoch
        browser.present(a.id,{x:500,y:120,width:600,height:600})
        expect(browser.active()!.epoch).toBeGreaterThan(first)
        browser.present(a.id,null);expect(browser.active()).toBeNull()
        expect(mocks.views[0].visible).toBe(false)
    })
    it('never exposes browser control IPC to a remote view or iframe',()=>{
        const {browser,host,wc}=setup();registerBrowserIpc(browser,()=>host as unknown as BrowserWindow)
        expect(()=>mocks.handlers.get('browser:create')({sender:{},senderFrame:{}})).toThrow('only available')
        expect(()=>mocks.handlers.get('browser:create')({sender:wc,senderFrame:{}})).toThrow('only available')
        expect(browser.snapshot().tabs).toHaveLength(0)
    })
    it('reports failed loads instead of claiming navigation succeeded',async()=>{
        const {browser}=setup();const tab=browser.create()
        mocks.views[0].webContents.loadURL.mockRejectedValueOnce(new Error('ERR_NAME_NOT_RESOLVED'))
        await expect(browser.navigate(tab.id,'https://bad.invalid')).rejects.toThrow('ERR_NAME_NOT_RESOLVED')
        expect(browser.snapshot().tabs[0].error).toContain('ERR_NAME_NOT_RESOLVED')
    })
})
