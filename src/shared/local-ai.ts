export interface LocalAIStatus {
    phase: 'idle' | 'installing' | 'starting' | 'downloading' | 'ready' | 'paused' | 'error'
    message: string
    percent?: number
}
export const LOCAL_MODEL = 'qwen2.5-coder:1.5b'
