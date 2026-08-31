export interface WorkspaceRoot { path: string; name: string }
export interface WorkspaceEntry { path: string; name: string; directory: boolean }
export interface WorkspaceFile { path: string; content: string; revision: string }
export interface WorkspaceTaskEvent {
    running: boolean
    message: string
    path?: string
    command?: string
    approvalId?: string
}
export interface WorkspaceBridge {
    root(): Promise<WorkspaceRoot>
    choose(): Promise<WorkspaceRoot | null>
    list(path?: string): Promise<WorkspaceEntry[]>
    read(path: string): Promise<WorkspaceFile>
    write(file: WorkspaceFile): Promise<WorkspaceFile>
    review(): Promise<string>
    run(command: string): Promise<{ output: string; exitCode: number; cwd: string; command: string }>
    stop(): Promise<void>
    task(text: string, captures?: import('./types').TurnCapture[]): Promise<void>
    approve(id: string, allow: boolean): Promise<void>
    onTask(cb: (event: WorkspaceTaskEvent) => void): () => void
}
