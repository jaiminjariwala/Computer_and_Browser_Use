import { describe, expect, it, vi } from 'vitest'
import { WorkspaceAgent, isPrivatePath } from './workspace-agent'
import type { WorkspaceService } from './workspace'
import type { WorkspaceTaskEvent } from '../shared/workspace'
import { isWorkspaceTask } from '../renderer/sidebar/intentRouter'

function fakeFiles() {
    return { root: () => ({ path: '/project', name: 'project' }), read: vi.fn(async () => ({ path: 'app.ts', content: 'old', revision: 'old-hash' })), write: vi.fn(async () => ({ revision: 'new-hash' })), list: vi.fn(async () => []), execute: vi.fn(async () => ({ output: '', exitCode: 0 })), stop: vi.fn() }
}
describe('workspace creation runner', () => {
    it('retries prose without executing it and stops after bounded invalid replies', async () => {
        const files = fakeFiles()
        const complete = vi.fn().mockResolvedValue('To download Blender, visit the website.')
        const agent = new WorkspaceAgent(files as unknown as WorkspaceService, complete, () => {})
        expect(await agent.start('open Blender')).toContain('returning advice instead of tool actions')
        expect(complete).toHaveBeenCalledTimes(3)
        expect(files.execute).not.toHaveBeenCalled()
    })
    it('recovers when the model corrects its action format', async () => {
        const files = fakeFiles()
        const complete = vi.fn().mockResolvedValueOnce('Let me inspect the folder.').mockResolvedValueOnce('{"tool":"list","path":""}').mockResolvedValueOnce('{"tool":"done","message":"Inspected folder"}')
        const agent = new WorkspaceAgent(files as unknown as WorkspaceService, complete, () => {})
        expect(await agent.start('inspect project')).toBe('Inspected folder')
        expect(files.list).toHaveBeenCalledOnce()
    })
    it('reads an existing file and uses its revision for an edit', async () => {
        const files = fakeFiles()
        const complete = vi.fn().mockResolvedValueOnce('{"tool":"read","path":"app.ts"}').mockResolvedValueOnce('{"tool":"write","path":"app.ts","content":"new"}').mockResolvedValueOnce('{"tool":"done","message":"Updated app.ts"}')
        const agent = new WorkspaceAgent(files as unknown as WorkspaceService, complete, () => {})
        expect(await agent.start('edit app.ts')).toBe('Updated app.ts')
        expect(files.write).toHaveBeenCalledWith({ path: 'app.ts', content: 'new', revision: 'old-hash' })
    })
    it('stopping a task awaiting command approval prevents execution', async () => {
        const files = fakeFiles()
        const complete = vi.fn().mockResolvedValue('{"tool":"command","executable":"node","args":["script.js"]}')
        let agent: WorkspaceAgent
        agent = new WorkspaceAgent(files as unknown as WorkspaceService, complete, (event: WorkspaceTaskEvent) => { if (event.approvalId) agent.stop() })
        expect(await agent.start('build an app')).toContain('stopped')
        expect(files.execute).not.toHaveBeenCalled()
    })
    it('will not execute an action returned after Stop', async () => {
        const files = fakeFiles()
        let reply!: (text: string) => void
        const complete = vi.fn(() => new Promise<string>(resolve => { reply = resolve }))
        const agent = new WorkspaceAgent(files as unknown as WorkspaceService, complete, () => {})
        const running = agent.start('create an app')
        agent.stop()
        reply('{"tool":"write","path":"evil.txt","content":"late"}')
        expect(await running).toContain('stopped')
        expect(files.write).not.toHaveBeenCalled()
    })
    it('automatically installs a named missing app through the curated cask', async () => {
        const files = fakeFiles()
        files.execute.mockResolvedValueOnce({ output: 'not found', exitCode: 1 })
        const complete = vi.fn().mockResolvedValueOnce('{"tool":"app","name":"Blender"}').mockResolvedValueOnce('{"tool":"done","message":"Opened Blender"}')
        const emit = vi.fn()
        const agent = new WorkspaceAgent(files as unknown as WorkspaceService, complete, emit)
        await agent.start('open Blender')
        expect(files.execute.mock.calls.some(call => JSON.stringify(call).includes('install'))).toBe(true)
        expect(emit.mock.calls.some(([event]) => event.message.includes('Stop to cancel'))).toBe(true)
    })
    it('keeps sensitive files out of model file tools', () => {
        for (const path of ['.env', 'backend/.env.local', '.git/config', '.ssh/id_rsa', 'cert.pem']) expect(isPrivatePath(path)).toBe(true)
        expect(isPrivatePath('.env.example')).toBe(false)
    })
    it('routes app creation and Blender to the workspace without hijacking questions', () => {
        expect(isWorkspaceTask('Open Blender and build a rocket')).toBe(true)
        expect(isWorkspaceTask('Install the latest stable version of Blender for Mac')).toBe(true)
        expect(isWorkspaceTask('Download Blender')).toBe(true)
        expect(isWorkspaceTask('Build these Figma frames into a Swift app')).toBe(true)
        expect(isWorkspaceTask('Explain how React works')).toBe(false)
        expect(isWorkspaceTask('Open YouTube')).toBe(false)
    })
})
