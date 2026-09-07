import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, access, readFile, writeFile, statfs, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import { LOCAL_MODEL, type LocalAIStatus } from '../shared/local-ai'

const run = promisify(execFile)
export const LOCAL_AI_URL = 'http://127.0.0.1:11435'
const exists = async (path: string): Promise<boolean> => access(path).then(() => true, () => false)

/** Private, loopback-only Ollama process. Never modifies an existing installation. */
export class LocalAI {
    private state: LocalAIStatus = { phase: 'idle', message: 'Local AI will prepare in the background (~1 GB model plus Ollama).' }
    private pending?: Promise<void>
    private abort?: AbortController
    private server?: ChildProcess
    private readonly root: string
    constructor(userData: string) { this.root = join(userData, 'local-ai') }
    status(): LocalAIStatus { return { ...this.state } }
    private update(phase: LocalAIStatus['phase'], message: string, percent?: number): void { this.state = { phase, message, percent } }
    start(resume = false): Promise<void> {
        if (this.pending || this.state.phase === 'ready') return this.pending ?? Promise.resolve()
        this.pending = this.begin(resume).catch(error => {
            this.server?.kill()
            this.server = undefined
            if (this.abort?.signal.aborted) this.update('paused', 'Local AI setup paused. Resume when you are ready.')
            else this.update('error', error instanceof Error ? error.message : 'Local AI setup failed.')
        }).finally(() => { this.pending = undefined })
        return this.pending
    }
    private async begin(resume: boolean): Promise<void> {
        this.abort = new AbortController()
        await mkdir(this.root, { recursive: true })
        const paused = join(this.root, 'paused')
        if (!resume && await exists(paused)) { this.update('paused', 'Local AI setup paused.'); return }
        if (resume) await unlink(paused).catch(() => {})
        await this.prepare(this.abort.signal)
    }
    async pause(): Promise<void> {
        await mkdir(this.root, { recursive: true })
        await writeFile(join(this.root, 'paused'), 'paused')
        this.abort?.abort()
        // Stopping our private server also stops any pull still running there.
        this.server?.kill()
        this.server = undefined
        this.update('paused', 'Local AI setup paused.')
    }
    dispose(): void { this.abort?.abort(); this.server?.kill() }
    async provider(): Promise<{baseURL:string; model:string; apiKey:string}> {
        if (this.state.phase !== 'ready') throw new Error(this.state.message)
        return {baseURL: LOCAL_AI_URL + '/v1', model: LOCAL_MODEL, apiKey: 'ollama-local'}
    }
    private async prepare(signal: AbortSignal): Promise<void> {
        if (process.platform !== 'darwin') throw new Error('Automatic local AI setup currently supports macOS only.')
        const disk = await statfs(this.root)
        if (disk.bavail * disk.bsize < 5 * 1024 ** 3) throw new Error('Local AI needs at least 5 GB of free disk space for setup.')
        const bundle = join(this.root, 'Ollama.app')
        let binary = '/Applications/Ollama.app/Contents/Resources/ollama'
        if (!await exists(binary)) {
            binary = join(bundle, 'Contents/Resources/ollama')
            if (!await exists(binary)) {
                this.update('installing', 'Downloading Ollama from ollama.com… You can pause setup.')
                const archive = join(this.root, 'Ollama.zip')
                const response = await fetch('https://ollama.com/download/Ollama-darwin.zip', {signal})
                if (!response.ok || !response.body) throw new Error('Could not download Ollama. Check your internet connection and retry.')
                await pipeline(Readable.fromWeb(response.body as never), createWriteStream(archive), {signal})
                signal.throwIfAborted()
                this.update('installing', 'Unpacking and verifying Ollama…')
                await run('/usr/bin/ditto', ['-xk', archive, this.root], {signal})
                await unlink(archive)
            }
        }
        // Reject untrusted/modified code; never bypass Gatekeeper/quarantine.
        const appBundle = binary.slice(0, binary.indexOf('/Contents/'))
        await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appBundle], {signal})
        await run('/usr/sbin/spctl', ['--assess', '--type', 'execute', appBundle], {signal})
        signal.throwIfAborted()
        this.update('starting', 'Starting local AI…')
        // Do not attach to an unknown service occupying the private port.
        if (await fetch(LOCAL_AI_URL + '/api/version', {signal: AbortSignal.timeout(500)}).then(() => true, () => false)) {
            throw new Error('Local AI port 11435 is already in use. Close the other Codex Lite instance and retry.')
        }
        let processError = ''
        this.server = spawn(binary, ['serve'], {env: {...process.env,
            OLLAMA_HOST:'127.0.0.1:11435', OLLAMA_NO_CLOUD:'1', OLLAMA_MODELS:join(this.root,'models'),
            OLLAMA_CONTEXT_LENGTH:'8192', OLLAMA_NUM_PARALLEL:'1'
        }, stdio:'ignore'})
        this.server.on('error', error => { processError = error.message })
        this.server.on('exit', () => { if (this.state.phase === 'ready') this.update('error', 'Local AI stopped. Retry setup to restart it.') })
        let reachable = false
        for (let attempt = 0; attempt < 60; attempt++) {
            signal.throwIfAborted()
            if (processError) throw new Error(processError)
            reachable = await fetch(LOCAL_AI_URL + '/api/version', {signal: AbortSignal.timeout(500)}).then(r => r.ok, () => false)
            if (reachable) break
            await new Promise(resolve => setTimeout(resolve, 500))
        }
        if (!reachable) throw new Error('Ollama did not start. Retry setup or check macOS security permissions.')
        const tags = await fetch(LOCAL_AI_URL + '/api/tags', {signal}).then(r => r.json()) as {models?:Array<{name:string}>}
        if (!tags.models?.some(m => m.name === LOCAL_MODEL)) {
            this.update('downloading', 'Downloading Qwen Coder starter model (~986 MB)…')
            const response = await fetch(LOCAL_AI_URL + '/api/pull', {method:'POST',signal,
                headers:{'Content-Type':'application/json'},body:JSON.stringify({model:LOCAL_MODEL,stream:true})})
            if (!response.ok || !response.body) throw new Error('Model download failed. Retry when connected.')
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let success = false
            while (true) {
                const chunk = await reader.read()
                if (chunk.done) break
                buffer += decoder.decode(chunk.value, {stream:true})
                const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
                for (const line of lines) {
                    if (!line.trim()) continue
                    const progress = JSON.parse(line) as {status?:string;error?:string;completed?:number;total?:number}
                    if (progress.error) throw new Error(progress.error)
                    if (progress.status === 'success') success = true
                    this.update('downloading', progress.status || 'Downloading model…', progress.total ? Math.round(100*(progress.completed||0)/progress.total) : undefined)
                }
            }
            if (!success) throw new Error('Model download was interrupted. Retry to resume.')
        }
        signal.throwIfAborted()
        this.update('ready', 'Qwen Coder · Local AI ready')
    }
}
