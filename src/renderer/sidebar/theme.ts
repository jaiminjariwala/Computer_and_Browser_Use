export type AppTheme = 'light' | 'dark'
const KEY = 'desktop-appearance'

export function getTheme(): AppTheme {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
}

export function setTheme(theme: AppTheme): void {
    localStorage.setItem(KEY, theme)
    document.documentElement.dataset.theme = theme
    window.dispatchEvent(new Event('desktop-theme-change'))
}

document.documentElement.dataset.theme = getTheme()
