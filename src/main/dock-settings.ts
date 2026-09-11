import { app, ipcMain, nativeImage, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { defaultDockPreferences, dockIcons, isDockPreferences, type DockPreferences } from '../shared/dock-icon'
import { startDockAnimation } from './dock-animation'

export function registerDockSettings(window: () => BrowserWindow | null): () => void {
    const path = join(app.getPath('userData'), 'dock-preferences.json')
    let preferences: DockPreferences = { ...defaultDockPreferences }
    try { const saved: unknown = JSON.parse(readFileSync(path, 'utf8')); if (isDockPreferences(saved)) preferences = saved } catch { /* First launch. */ }
    let stop = startDockAnimation(preferences)
    const folder = app.isPackaged ? join(process.resourcesPath, 'dock-icons') : join(app.getAppPath(), 'build', 'dock-icons')
    const previews = Object.fromEntries(dockIcons.map(icon => [icon, nativeImage.createFromPath(join(folder, icon, '00.png')).toDataURL()]))
    ipcMain.handle('dock:preferences', (event, input?: unknown) => {
        if (event.sender !== window()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted icon request')
        if (input !== undefined) {
            if (!isDockPreferences(input)) throw new Error('Invalid icon preferences')
            const next = { icon: input.icon, rotating: input.rotating }
            writeFileSync(`${path}.tmp`, JSON.stringify(next), { mode: 0o600 })
            renameSync(`${path}.tmp`, path)
            stop(); preferences = next; stop = startDockAnimation(preferences)
        }
        return { ...preferences, previews }
    })
    return () => { ipcMain.removeHandler('dock:preferences'); stop() }
}
