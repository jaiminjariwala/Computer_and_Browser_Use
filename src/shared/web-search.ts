export function wantsWebSearch(text: string): boolean {
    return /\b(search|look up|browse)\b.*\b(internet|web|online|for)\b|\b(search online|search the web|google this)\b/i.test(text)
}
