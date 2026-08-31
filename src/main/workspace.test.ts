import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceService } from './workspace'

const directories: string[] = []
afterEach(async () => { for (const path of directories.splice(0)) await fs.rm(path, { recursive: true, force: true }) })
async function service(): Promise<WorkspaceService> {
    const path = await fs.mkdtemp(join(tmpdir(), 'cbu-workspace-test-'))
    directories.push(path)
    const files = new WorkspaceService(path)
    await files.init()
    return files
}
describe('project file boundaries', () => {
    it('creates a dedicated project and restores the selected folder', async () => {
        const files = await service()
        expect(files.root().path).not.toBe(process.cwd())
        const next = join(directories[0], 'chosen')
        await fs.mkdir(next)
        await files.select(next)
        const reopened = new WorkspaceService(directories[0])
        await reopened.init()
        expect(reopened.root().path).toBe(await fs.realpath(next))
    })
    it('rejects traversal and symlink escapes on reads and creates', async () => {
        const files = await service()
        await expect(files.read('../../workspace.json')).rejects.toThrow('outside')
        await fs.symlink(directories[0], join(files.root().path, 'link'))
        await expect(files.read('link/workspace.json')).rejects.toThrow('Symbolic')
        await expect(files.write({ path: 'link/new.txt', content: 'bad', revision: '' })).rejects.toThrow('Symbolic')
    })
    it('prevents stale saves and overwrites of unread files', async () => {
        const files = await service()
        const first = await files.write({ path: 'src/app.ts', content: 'first', revision: '' })
        await files.write({ ...first, content: 'second' })
        await expect(files.write({ ...first, content: 'stale' })).rejects.toThrow('changed on disk')
        await expect(files.write({ path: first.path, content: 'overwrite', revision: '' })).rejects.toThrow('changed on disk')
        expect((await files.read(first.path)).content).toBe('second')
    })
    it('cancels a running process and rejects an already cancelled run', async () => {
        const files = await service()
        const controller = new AbortController()
        const running = files.execute(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], controller.signal)
        controller.abort()
        expect((await running).exitCode).not.toBe(0)
        await expect(files.execute(process.execPath, ['--version'], controller.signal)).rejects.toThrow('stopped')
    })
})
