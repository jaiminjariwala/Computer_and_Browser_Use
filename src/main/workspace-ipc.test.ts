import { beforeEach, describe, expect, it, vi } from 'vitest'
const { handlers, choose } = vi.hoisted(() => ({ handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(), choose: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (event: unknown, payload?: unknown) => unknown) => handlers.set(name, handler) }, dialog: { showOpenDialog: choose } }))
import { registerWorkspaceIpc } from './workspace-ipc'
import type { WorkspaceService } from './workspace'
import type { WorkspaceAgent } from './workspace-agent'
import type { BrowserWindow } from 'electron'

describe('workspace IPC boundary', () => {
    beforeEach(() => { handlers.clear(); choose.mockReset() })
    function setup() {
        const contents = { mainFrame: {} }
        const event = { sender: contents, senderFrame: contents.mainFrame }
        const files = { root: vi.fn(() => ({ path: '/project', name: 'project' })), select: vi.fn(), run: vi.fn() }
        const agent = { busy: vi.fn(() => false), stop: vi.fn() }
        const authenticate = vi.fn(async () => {})
        const task = vi.fn(async () => {})
        registerWorkspaceIpc(files as unknown as WorkspaceService, agent as unknown as WorkspaceAgent, { window: () => ({webContents: contents}) as unknown as BrowserWindow, authenticate, task })
        return { event, files, agent, authenticate, task }
    }
    it('rejects an iframe even inside the trusted window', () => {
        const { event, files } = setup()
        expect(() => handlers.get('project:root')!({...event, senderFrame: {}})).toThrow('Only the app workspace')
        expect(files.root).not.toHaveBeenCalled()
    })
    it('requires authentication before starting a task', async () => {
        const { event, authenticate, task } = setup()
        authenticate.mockRejectedValue(new Error('Sign in'))
        await expect(handlers.get('project:task')!(event, {text:'Build a web app'})).rejects.toThrow('Sign in')
        expect(task).not.toHaveBeenCalled()
    })
    it('rejects a folder switch if work started while the dialog was open', async () => {
        const { event, files, agent } = setup()
        choose.mockImplementation(async () => { agent.busy.mockReturnValue(true); return {canceled:false,filePaths:['/another-project']} })
        await expect(handlers.get('project:choose')!(event)).rejects.toThrow('Stop the task')
        expect(files.select).not.toHaveBeenCalled()
    })
    it('rejects non-image capture payloads', async () => {
        const { event, task } = setup()
        await expect(handlers.get('project:task')!(event, {text:'Build an app', captures:[{dataUrl:'file:///private/file'}]})).rejects.toThrow('Invalid design captures')
        expect(task).not.toHaveBeenCalled()
    })
})
