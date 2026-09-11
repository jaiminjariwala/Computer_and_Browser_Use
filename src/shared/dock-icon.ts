export const dockIcons = ['beach-ball', 'blue-ball'] as const
export type DockIcon = typeof dockIcons[number]
export interface DockPreferences { icon: DockIcon; rotating: boolean }
export const defaultDockPreferences: DockPreferences = { icon: 'beach-ball', rotating: true }
export function isDockPreferences(value: unknown): value is DockPreferences {
    if (!value || typeof value !== 'object') return false
    const p = value as DockPreferences
    return dockIcons.includes(p.icon) && typeof p.rotating === 'boolean'
}
