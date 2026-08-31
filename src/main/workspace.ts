import { promises as fs } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { WorkspaceEntry, WorkspaceFile, WorkspaceRoot } from '../shared/workspace'

const LIMIT = 1_000_000
const revision = (content: string): string => createHash('sha256').update(content).digest('hex')

/** All file tools resolve against an explicitly chosen folder, never the app source cwd. */
export class WorkspaceService {
    private folder = ''
    private writes: Promise<unknown> = Promise.resolve()
    private commands = new Set<() => void>()
    constructor(private readonly dataDir: string) {}

    async init(): Promise<void> {
        let selected = ''
        try { selected = JSON.parse(await fs.readFile(join(this.dataDir, 'workspace.json'), 'utf8')).path } catch { /* first launch */ }
        try { if (selected) await this.select(selected) } catch { /* removed folder */ }
        if (!this.folder) {
            const fallback = join(this.dataDir, 'Projects', 'My workspace')
            await fs.mkdir(fallback, { recursive: true })
            await this.select(fallback)
        }
    }
    root(): WorkspaceRoot { return { path: this.folder, name: basename(this.folder) } }
    async select(path: string): Promise<WorkspaceRoot> {
        if (this.commands.size) throw new Error('Stop running commands before changing folders.')
        const folder = await fs.realpath(path)
        if (!(await fs.stat(folder)).isDirectory()) throw new Error('Choose a folder.')
        await fs.mkdir(this.dataDir, { recursive: true })
        await fs.writeFile(join(this.dataDir, 'workspace.json'), JSON.stringify({ path: folder }))
        this.folder = folder
        return this.root()
    }
    private async path(path: string, creating = false): Promise<string> {
        if (typeof path !== 'string' || isAbsolute(path) || path.includes('\0')) throw new Error('Use a relative workspace path.')
        const target = resolve(this.folder, path)
        const inside = (candidate: string): boolean => candidate === this.folder || candidate.startsWith(this.folder + sep)
        if (!inside(target)) throw new Error('Path is outside the workspace.')
        // Reject symlinks, including parent components, for both reads and writes.
        let part = this.folder
        for (const segment of relative(this.folder, target).split(sep).filter(Boolean)) {
            part = join(part, segment)
            try {
                if ((await fs.lstat(part)).isSymbolicLink()) throw new Error('Symbolic links are not editable workspace files.')
            } catch (error) {
                if (creating && (error as NodeJS.ErrnoException).code === 'ENOENT') continue
                throw error
            }
        }
        return target
    }
    async list(path = ''): Promise<WorkspaceEntry[]> {
        const entries = await fs.readdir(await this.path(path), { withFileTypes: true })
        return entries.filter(e => !e.isSymbolicLink()).map(e => ({
            name: e.name, path: [path, e.name].filter(Boolean).join('/'), directory: e.isDirectory()
        })).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)).slice(0, 2000)
    }
    async read(path: string): Promise<WorkspaceFile> {
        const target = await this.path(path)
        const stat = await fs.stat(target)
        if (!stat.isFile() || stat.size > LIMIT) throw new Error('Open a text file smaller than 1 MB.')
        const content = await fs.readFile(target, 'utf8')
        if (content.includes('\0')) throw new Error('Binary files cannot be edited as text.')
        return { path, content, revision: revision(content) }
    }
    write(file: WorkspaceFile): Promise<WorkspaceFile> {
        const operation = this.writes.then(async () => {
            if (typeof file.content !== 'string' || Buffer.byteLength(file.content) > LIMIT) throw new Error('File exceeds 1 MB.')
            const target = await this.path(file.path, true)
            let current = ''
            try { current = (await this.read(file.path)).revision } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            }
            if (current !== file.revision) throw new Error('File changed on disk. Reopen it before saving to avoid overwriting changes.')
            await fs.mkdir(dirname(target), { recursive: true })
            // Validate newly created parents again before writing.
            await this.path(file.path, true)
            await fs.writeFile(target, file.content, { flag: current ? 'w' : 'wx' })
            return { ...file, revision: revision(file.content) }
        })
        this.writes = operation.catch(() => undefined)
        return operation
    }
    stop(): void { for (const cancel of this.commands) cancel() }
    async execute(executable: string, args: string[], signal?: AbortSignal, onOutput?: (chunk: string) => void): Promise<{ output: string; exitCode: number }> {
        if (signal?.aborted) throw new Error('Task stopped.')
        const cwd = this.folder
        return new Promise((resolveResult) => {
            const child = spawn(executable, args, { cwd, detached: true, env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
            let output = '', settled = false
            let killTimer: ReturnType<typeof setTimeout> | undefined
            const kill = (sig: NodeJS.Signals): void => { try { if (child.pid) process.kill(-child.pid, sig) } catch { /* exited */ } }
            const cancel = (): void => { kill('SIGTERM'); killTimer ??= setTimeout(() => kill('SIGKILL'), 1500) }
            const timer = setTimeout(cancel, 10 * 60_000)
            this.commands.add(cancel)
            signal?.addEventListener('abort', cancel, { once: true })
            const finish = (exitCode: number): void => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                if (killTimer) { kill('SIGKILL'); clearTimeout(killTimer) }
                this.commands.delete(cancel)
                signal?.removeEventListener('abort', cancel)
                resolveResult({ output, exitCode })
            }
            const receive = (chunk: Buffer): void => {
                const text = chunk.toString()
                output = (output + text).slice(-LIMIT)
                onOutput?.(text.slice(-4000))
            }
            child.stdout.on('data', receive)
            child.stderr.on('data', receive)
            child.on('error', error => { output += error.message; finish(1) })
            child.on('close', code => finish(code ?? 1))
        })
    }
    async run(command: string): Promise<{ command: string; output: string; exitCode: number; cwd: string }> {
        if (!command.trim() || command.length > 20_000) throw new Error('Enter a valid command.')
        const cwd = this.folder
        return { command, cwd, ...await this.execute('/bin/zsh', ['-lc', command]) }
    }
    async review(): Promise<string> {
        const result = await this.execute('git', ['diff', '--no-ext-diff', '--no-textconv', 'HEAD'])
        const status = await this.execute('git', ['status', '--short'])
        return status.exitCode ? 'This folder is not a Git repository.' : (`${status.output}\n${result.output}`.trim() || 'No changes.')
    }
}
