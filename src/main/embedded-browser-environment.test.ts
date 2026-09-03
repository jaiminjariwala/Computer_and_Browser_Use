import {describe,expect,it,vi} from 'vitest'
import {EmbeddedBrowserEnvironment} from './embedded-browser-environment'
import type {EmbeddedBrowser} from './embedded-browser'
function setup() {
    let epoch=1, password=false
    const contents={isDestroyed:()=>false,isLoadingMainFrame:()=>false,sendInputEvent:vi.fn(),insertText:vi.fn(),capturePage:vi.fn(async()=>({toJPEG:()=>Buffer.from('preview')})),
        executeJavaScript:vi.fn(async(script:string)=>{
            if(script.includes('collectInteractiveElements'))return [{role:'input',title:'Search',x:10,y:10,width:200,height:30}]
            if(script.includes('readPageDigest'))return {title:'Example',url:'https://example.com/private?token=secret',text:'Example text'}
            if(script.includes('innerWidth'))return {width:800,height:600}
            if(script.includes('editable:'))return {editable:true,password}
            return false
        })}
    const browser={active:()=>({id:'a',epoch,bounds:{x:0,y:0,width:800,height:600},contents}),snapshot:()=>({tabs:[{id:'a',title:'Example',url:'https://example.com'}]}),navigate:vi.fn(async()=>{}),stopNavigation:vi.fn(()=>{epoch++}),ensureActive:vi.fn(async()=>{})}
    const environment=new EmbeddedBrowserEnvironment(browser as unknown as EmbeddedBrowser)
    return {environment,browser,contents,changeTab:()=>epoch++,setPassword:()=>{password=true}}
}
describe('embedded browser operator adapter',()=>{
    it('captures the displayed page and minimizes URL metadata',async()=>{
        const {environment}=setup();const result=await environment.capture()
        expect(result.ok).toBe(true)
        if(!result.ok)throw Error('capture failed')
        expect(result.observation.pageText).toContain('Example text')
        expect(result.observation.pageText).not.toContain('token=secret')
        expect(result.observation.a11yElements?.[0].title).toBe('Search')
    })
    it('rejects stale/reused observations and never clicks a switched tab',async()=>{
        const {environment,contents,changeTab}=setup();const result=await environment.capture()
        if(!result.ok)throw Error('capture failed')
        changeTab()
        expect(await environment.execute({kind:'left_click',at:{x:20,y:20}},result.observation)).toMatchObject({status:'failure'})
        expect(contents.sendInputEvent).not.toHaveBeenCalled()
    })
    it('Cmd+L and typing use navigation in the same embedded tab',async()=>{
        const {environment,browser,contents}=setup();let result=await environment.capture()
        if(!result.ok)throw Error('capture failed')
        await environment.execute({kind:'key',keys:['cmd','l']},result.observation)
        result=await environment.capture();if(!result.ok)throw Error('capture failed')
        await environment.execute({kind:'type',text:'youtube.com'},result.observation)
        expect(browser.navigate).toHaveBeenCalledWith('a','youtube.com')
        expect(contents.insertText).not.toHaveBeenCalled()
    })
    it('requires a fresh observation after cancellation',async()=>{
        const {environment,contents}=setup();const result=await environment.capture()
        if(!result.ok)throw Error('capture failed')
        environment.cancel()
        expect(await environment.execute({kind:'type',text:'hello'},result.observation)).toMatchObject({status:'failure'})
        expect(contents.insertText).not.toHaveBeenCalled()
    })
    it('does not automate password fields',async()=>{
        const {environment,contents,setPassword}=setup();const result=await environment.capture()
        if(!result.ok)throw Error('capture failed')
        setPassword()
        expect(await environment.execute({kind:'type',text:'a secret'},result.observation)).toMatchObject({status:'failure'})
        expect(contents.insertText).not.toHaveBeenCalled()
    })
})
