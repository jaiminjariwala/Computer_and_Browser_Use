export interface BrowserTabState {
    id: string
    title: string
    url: string
    loading: boolean
    canGoBack: boolean
    canGoForward: boolean
    error?: string
}
export interface BrowserSnapshot { tabs: BrowserTabState[]; selectedId: string | null; focusId?: string }
export interface BrowserBounds { x: number; y: number; width: number; height: number }
export interface BrowserWorkspaceBridge {
    list(): Promise<BrowserSnapshot>
    create(): Promise<BrowserTabState>
    close(id: string): Promise<void>
    navigate(id: string, address: string): Promise<void>
    action(id: string, action: 'back' | 'forward' | 'reload' | 'stop'): Promise<void>
    present(id: string, bounds: BrowserBounds | null): Promise<void>
    onChanged(callback: (state: BrowserSnapshot) => void): () => void
    onFocusAddress(callback: (id: string) => void): () => void
}
