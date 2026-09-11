import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ setIcon: vi.fn(), on: vi.fn(), removeListener: vi.fn(), reduced: false }))
vi.mock('electron', () => ({
    app: { dock: { setIcon: mocks.setIcon }, isPackaged: false, getAppPath: () => '/app' },
    nativeImage: { createFromPath: (path: string) => ({ path, isEmpty: () => false }) },
    powerMonitor: { on: mocks.on, removeListener: mocks.removeListener },
    systemPreferences: { getAnimationSettings: () => ({ prefersReducedMotion: mocks.reduced }) }
}))
import { startDockAnimation } from './dock-animation'
import { isDockPreferences } from '../shared/dock-icon'
it('rejects unknown icons and nonboolean rotation preferences', () => {
    expect(isDockPreferences({ icon: '../secret', rotating: true })).toBe(false)
    expect(isDockPreferences({ icon: 'sun', rotating: 'yes' })).toBe(false)
    expect(isDockPreferences({ icon: 'blue-ball', rotating: false })).toBe(true)
})
it.skipIf(process.platform !== 'darwin')('holds the selected icon still when rotation is disabled', () => {
    vi.useFakeTimers()
    const stop = startDockAnimation({ icon: 'blue-ball', rotating: false })
    vi.advanceTimersByTime(1000)
    expect(mocks.setIcon).toHaveBeenCalledTimes(1)
    expect(mocks.setIcon.mock.calls[0][0].path).toContain('/blue-ball/00.png')
    stop()
})
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); mocks.reduced = false })
it.skipIf(process.platform !== 'darwin')('cycles cached frames and releases its timer and listeners', () => {
    vi.useFakeTimers()
    const stop = startDockAnimation()
    expect(mocks.setIcon).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(mocks.setIcon.mock.calls.length).toBeGreaterThan(1)
    stop()
    const count = mocks.setIcon.mock.calls.length
    vi.advanceTimersByTime(500)
    expect(mocks.setIcon).toHaveBeenCalledTimes(count)
    expect(mocks.removeListener).toHaveBeenCalledTimes(4)
})
it.skipIf(process.platform !== 'darwin')('keeps a static icon when reduced motion is enabled', () => {
    vi.useFakeTimers()
    mocks.reduced = true
    const stop = startDockAnimation()
    vi.advanceTimersByTime(1000)
    expect(mocks.setIcon).toHaveBeenCalledTimes(1)
    stop()
})
