import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { TurnCapture } from '../shared/types'
import type { WorkspaceFile } from '../shared/workspace'
import type { WorkspaceService } from './workspace'
import type { WorkspaceAgent } from './workspace-agent'

export function registerWorkspaceIpc(files: WorkspaceService, agent: WorkspaceAgent, deps: {
    window: () => BrowserWindow | null
    authenticate: () => Promise<void>
    task: (text: string, captures: TurnCapture[]) => Promise<void>
}): void {
    const handlers: Record<string, (payload: any) => unknown> = {
        root: () => files.root(),
        choose: async () => {
            if (agent.busy()) throw new Error('Stop the task before switching folders.')
            const window = deps.window()
            if (!window) throw new Error('Workspace window is closed.')
            const result = await dialog.showOpenDialog(window, { title: 'Open project folder', properties: ['openDirectory', 'createDirectory'] })
            if (agent.busy()) throw new Error('Stop the task before switching folders.')
            return result.canceled ? null : files.select(result.filePaths[0])
        },
        list: (path: string) => files.list(path),
        read: (path: string) => files.read(path),
        write: (file: WorkspaceFile) => files.write(file),
        review: () => files.review(),
        run: async (command: string) => { await deps.authenticate(); return files.run(command) },
        stop: () => agent.stop(),
        approve: (payload: { id: string; allow: boolean }) => agent.approve(payload.id, payload.allow === true),
        task: async (payload: { text: string; captures?: TurnCapture[] }) => {
            await deps.authenticate()
            if (agent.busy()) throw new Error('A workspace task is already running.')
            if (typeof payload?.text !== 'string' || !payload.text.trim() || payload.text.length > 50_000) throw new Error('Enter a task.')
            const captures = payload.captures ?? []
            if (!Array.isArray(captures) || captures.length > 24 || captures.some(c => typeof c?.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(c.dataUrl) || c.dataUrl.length > 10_000_000)) throw new Error('Invalid design captures.')
            await deps.task(payload.text, captures)
        }
    }
    for (const [name, handler] of Object.entries(handlers)) {
        ipcMain.handle(`project:${name}`, (event: IpcMainInvokeEvent, payload: unknown) => {
            const window = deps.window()
            if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Only the app workspace may access project tools.')
            return handler(payload)
        })
    }
}
