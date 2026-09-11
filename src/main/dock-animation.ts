import { app, nativeImage, powerMonitor, systemPreferences } from 'electron'
import { join } from 'node:path'
import { defaultDockPreferences, type DockPreferences } from '../shared/dock-icon'

/** Pre-rendered frames: no rendering work or hidden browser window per tick. */
export function startDockAnimation(preferences: DockPreferences = defaultDockPreferences): () => void {
    const dock = app.dock
    if (process.platform !== 'darwin' || !dock) return () => {}
    const folder = app.isPackaged ? join(process.resourcesPath, 'dock-icons') : join(app.getAppPath(), 'build', 'dock-icons')
    const frames = Array.from({ length: preferences.rotating ? 48 : 1 }, (_, i) => nativeImage.createFromPath(join(folder, preferences.icon, `${String(i).padStart(2, '0')}.png`)))
    if (frames.some(frame => frame.isEmpty())) return () => {}
    let index = 0
    let suspended = false
    dock.setIcon(frames[0])
    const pause = (): void => { suspended = true }
    const resume = (): void => { suspended = false }
    powerMonitor.on('suspend', pause)
    powerMonitor.on('lock-screen', pause)
    powerMonitor.on('resume', resume)
    powerMonitor.on('unlock-screen', resume)
    const timer = setInterval(() => {
        if (!preferences.rotating || suspended || systemPreferences.getAnimationSettings().prefersReducedMotion) return
        index = (index + 1) % frames.length
        dock.setIcon(frames[index])
    }, 1000 / 12)
    timer.unref()
    return () => {
        clearInterval(timer)
        powerMonitor.removeListener('suspend', pause)
        powerMonitor.removeListener('lock-screen', pause)
        powerMonitor.removeListener('resume', resume)
        powerMonitor.removeListener('unlock-screen', resume)
        dock.setIcon(frames[0])
    }
}
