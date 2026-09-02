/** URL/search bar input. Never allow privileged/file/script schemes into a tab. */
export function browserAddress(input: string): string {
    const text = input.trim()
    if (!text || text.length > 8192) throw new Error('Enter a URL or search term.')
    if (text === 'about:blank') return text
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(text) && !/^(localhost|127\.0\.0\.1):\d+/i.test(text)
    let target: string
    if (hasScheme) target = text
    else if (/^(localhost|127\.0\.0\.1)(:\d+)?([/?#]|$)/i.test(text)) target = `http://${text}`
    else if (!/\s/.test(text) && /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text)) target = `https://${text}`
    else return `https://www.google.com/search?q=${encodeURIComponent(text)}`
    const url = new URL(target)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS address without embedded credentials.')
    return url.href
}
export function allowedBrowserNavigation(url: string): boolean {
    if (url === 'about:blank') return true
    try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password } catch { return false }
}
