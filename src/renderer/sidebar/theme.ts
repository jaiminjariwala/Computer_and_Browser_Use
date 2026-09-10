export type AppTheme = 'light' | 'dark'
const KEY = 'desktop-appearance'

export function getTheme(): AppTheme {
    const value = localStorage.getItem(KEY)
    return value === 'light' ? 'light' : 'dark'
}

function applyTheme(): void {
    document.documentElement.dataset.theme = getTheme()
}

export function setTheme(theme: AppTheme): void {
    localStorage.setItem(KEY, theme)
    applyTheme()
    window.dispatchEvent(new Event('desktop-theme-change'))
}

applyTheme()
