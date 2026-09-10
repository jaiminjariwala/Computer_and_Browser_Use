// UI smoke test with an in-memory IPC fixture. No model calls or real project edits.
// Run: node scripts/smoke-workspace.mjs
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const entry = resolve('scripts/__workspace-smoke.tsx')
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectWorkspace } from '/src/renderer/sidebar/ProjectWorkspace';
import { PlusUpgradeModal } from '/src/renderer/sidebar/PlusUpgradeModal';
import '/src/renderer/sidebar/styles.css';
const files = {'src/main.ts': {path:'src/main.ts', content:'export const rocket = "Ready for launch";\\n', revision:'1'}, 'README.md': {path:'README.md', content:'# Rocket workspace', revision:'1'}};
let listener = () => {};
window.glass = {startPlusCheckout:async()=>{throw new Error('Sandbox checkout unavailable')}};
window.showAccess=()=>{const host=document.createElement('div');document.body.append(host);const root=createRoot(host);root.render(<PlusUpgradeModal onClose={()=>root.unmount()}/>)};
window.workspace = {
 root: async () => ({path:'/fixture/Rocket',name:'Rocket'}),
 choose: async () => null,
 list: async (path='') => path === 'src' ? [{name:'main.ts',path:'src/main.ts',directory:false}] : [{name:'src',path:'src',directory:true},{name:'README.md',path:'README.md',directory:false}],
 read: async path => ({...files[path]}),
 write: async file => {if(files[file.path]?.revision !== file.revision) throw Error('Conflict'); files[file.path]={...file,revision:'2'}; window.saved=file.content; return {...files[file.path]};},
 review: async () => '+ export const rocket = "Ready";',
 run: async command => ({command,output:'workspace-terminal-ok',exitCode:0,cwd:'/fixture/Rocket'}),
 stop: async () => {window.stopped=true; listener({running:false,message:'Stopped'});},
 approve: async () => {}, task: async () => {},
 onTask: cb => {listener=cb; window.emitActivity=cb; return () => {}},
};
let browserListener=()=>{};
let browserTabs=[];
window.browserWorkspace={
 list:async()=>({tabs:browserTabs,selectedId:null}),
 create:async()=>{const tab={id:'test',title:'New tab',url:'about:blank',loading:false,canGoBack:false,canGoForward:false};browserTabs=[tab];browserListener({tabs:browserTabs,selectedId:'test',focusId:'test'});return tab},
 navigate:async(id,address)=>{window.browserAddress=address},
 close:async()=>{browserTabs=[];browserListener({tabs:[],selectedId:null})},
 present:async()=>{},action:async()=>{},onChanged:cb=>{browserListener=cb;return()=>{}},onFocusAddress:()=>()=>{}
};
createRoot(document.getElementById('root')).render(<div style={{display:'flex',height:'100vh'}}><div style={{flex:1,padding:40}}>Chat stays beside the project.</div><ProjectWorkspace visible artifact={null} onClose={()=>{}} width={850} onResize={()=>{}} /></div>);
`
const server = await createServer({
    configFile: false,
    resolve: { alias: { '@shared': resolve('src/shared'), '@op-shared': resolve('src/main/operator/shared') } },
    plugins: [react(), {
        name: 'workspace-smoke-fixture',
        resolveId(id) { if (id === '/__workspace-smoke.tsx') return entry },
        load(id) { if (id === entry) return fixture },
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (req.url !== '/workspace-smoke.html') return next()
                res.setHeader('Content-Type', 'text/html')
                res.end(await server.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__workspace-smoke.tsx"></script></body></html>'))
            })
        }
    }],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error'
})
let browser
try {
    await server.listen()
    browser = await chromium.launch({ headless: true, channel: 'chrome' })
    const page = await browser.newPage({ viewport: {width:1440,height:900} })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${server.resolvedUrls.local[0]}workspace-smoke.html`)
    await page.getByTitle('src', {exact:true}).click()
    await page.getByTitle('src/main.ts', {exact:true}).click()
    await page.locator('.monaco-editor textarea').waitFor()
    assert.equal(await page.locator('.monaco-editor').first().evaluate(node => getComputedStyle(node).outlineStyle),'none')
    await page.locator('.monaco-editor textarea').focus()
    await page.keyboard.press('Meta+End')
    await page.keyboard.type('// saved from workspace')
    await page.getByRole('button', {name:'Save',exact:true}).click()
    await page.waitForFunction(() => window.saved?.includes('saved from workspace'))
    const screenshot = resolve(tmpdir(), 'computer-browser-workspace.png')
    await page.screenshot({path:screenshot})
    await page.getByRole('button',{name:'Add workspace tab'}).click()
    await page.getByRole('menuitem').filter({hasText:'Terminal'}).click()
    await page.getByLabel('Project terminal command').fill('pwd')
    await page.getByLabel('Project terminal command').press('Enter')
    await page.getByText('workspace-terminal-ok',{exact:false}).waitFor()
    await page.getByRole('button',{name:'Add workspace tab'}).click()
    await page.getByRole('menuitem').filter({hasText:'Browser'}).click()
    await page.getByLabel('Search or enter a URL').fill('youtube.com')
    await page.getByRole('button',{name:'Go to address'}).click()
    await page.waitForFunction(()=>window.browserAddress==='youtube.com')
    assert.equal(await page.locator('iframe').count(),0)
    assert.equal(await page.getByRole('navigation',{name:'Project files'}).count(),0)
    await page.getByRole('button',{name:'Add workspace tab'}).click()
    assert.equal(await page.getByRole('menuitem').filter({hasText:'Files'}).locator('svg').count(),1)
    await page.getByRole('menuitem').filter({hasText:'Files'}).click()
    await page.getByRole('navigation',{name:'Project files'}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Toggle files',exact:true}).count(),0)
    await page.getByRole('button',{name:'Close files',exact:true}).click()
    assert.equal(await page.getByRole('navigation',{name:'Project files'}).count(),0)
    await page.evaluate(() => window.emitActivity({running:true,message:'Creating rocket scene'}))
    await page.getByRole('button',{name:'Stop',exact:true}).click()
    assert.equal(await page.evaluate(() => window.stopped),true)
    await page.evaluate(() => window.showAccess())
    await page.getByRole('dialog').waitFor()
    await page.getByRole('button',{name:'Subscribe for $1/month',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'Sandbox checkout unavailable'}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Subscribe for $1/month',exact:true}).isEnabled(),true)
    await page.screenshot({path:resolve(tmpdir(),'desktop-access-smoke.png')})
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(),0)
    assert.deepEqual(errors,[])
    console.log(`Workspace smoke passed: tree, editor, save, terminal tab, embedded browser controls, Stop. Screenshot: ${screenshot}`)
} finally {
    await browser?.close()
    await server.close()
}
