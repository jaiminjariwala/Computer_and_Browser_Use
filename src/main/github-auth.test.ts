import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
    app: { getPath: () => tmpdir() },
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
    shell: { openExternal: vi.fn() },
    safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.alloc(0),
        decryptString: () => ''
    }
}))

import type { SecretCodec } from './config'
import { GitHubAuthService, GitHubTokenStore } from './github-auth'

function fakeCodec(): SecretCodec {
    return {
        isEncryptionAvailable: () => true,
        encryptString: (plain) => Buffer.from(`encrypted:${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8'),
        decryptString: (data) => {
            const value = data.toString('utf8')
            if (!value.startsWith('encrypted:')) throw new Error('invalid ciphertext')
            return Buffer.from(value.slice('encrypted:'.length), 'base64').toString('utf8')
        }
    }
}

describe('GitHub authentication persistence', () => {
    let dir: string
    let store: GitHubTokenStore
    let codec: SecretCodec

    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'github-auth-'))
        codec = fakeCodec()
        store = new GitHubTokenStore({ userDataDir: dir, codec })
    })

    afterEach(async () => {
        vi.useRealTimers()
        vi.unstubAllEnvs()
        await fs.rm(dir, { recursive: true, force: true })
    })

    it('encrypts and restores the token with its cached public profile', async () => {
        const user = { login: 'octocat', name: 'The Octocat', avatarUrl: 'https://avatars.example/octocat.png' }
        await store.write('github-token', user)

        const bytes = await fs.readFile(join(dir, 'github-token.enc'), 'utf8')
        expect(bytes).not.toContain('"token":"github-token"')
        expect(await store.readSession()).toEqual({ token: 'github-token', user })
    })

    it('restores a cached login immediately without waiting for GitHub', async () => {
        const user = { login: 'octocat', name: 'The Octocat' }
        await store.write('github-token', user)
        const neverResolves = vi.fn(() => new Promise<Response>(() => undefined))
        const service = new GitHubAuthService({
            clientId: 'public-client-id',
            tokenStore: store,
            fetchImpl: neverResolves as typeof fetch
        })

        await expect(service.getStatus()).resolves.toEqual({ state: 'signed-in', user })
        expect(neverResolves).toHaveBeenCalledOnce()
        service.dispose()
    })

    it('keeps legacy encrypted token files signed in while refreshing the profile', async () => {
        await fs.writeFile(join(dir, 'github-token.enc'), codec.encryptString('legacy-token'))
        const neverResolves = vi.fn(() => new Promise<Response>(() => undefined))
        const service = new GitHubAuthService({
            clientId: 'public-client-id',
            tokenStore: store,
            fetchImpl: neverResolves as typeof fetch
        })

        await expect(service.getStatus()).resolves.toMatchObject({ state: 'signed-in' })
        service.dispose()
    })

    it('waits for saved credentials for simultaneous startup requests', async () => {
        const user = { login: 'octocat' }
        let finishRead!: (value: { token: string; user: typeof user }) => void
        vi.spyOn(store, 'readSession').mockImplementation(() => new Promise(resolve => { finishRead = resolve }))
        const service = new GitHubAuthService({
            clientId: 'public-client-id', tokenStore: store,
            fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch
        })
        const first = service.getStatus()
        const second = service.getStatus()
        finishRead({ token: 'github-token', user })
        await expect(first).resolves.toEqual({ state: 'signed-in', user })
        await expect(second).resolves.toEqual({ state: 'signed-in', user })
        service.dispose()
    })

    it('opens browser OAuth without exposing a code or token to the renderer', async () => {
        vi.stubEnv('MANAGED_BACKEND_URL', 'https://backend.example')
        vi.useFakeTimers()
        const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
            String(url).endsWith('/start') ? { authorization_url: 'https://github.com/login/oauth/authorize?state=test', state: 'test', poll_token: 'private-poll' } :
            String(url).endsWith('/poll') ? { access_token: 'private-access' } : { login: 'octocat' }
        ), { status: 200 }))
        const openExternal = vi.fn(async () => undefined)
        const service = new GitHubAuthService({ clientId: 'client', tokenStore: store, fetchImpl: fetchImpl as typeof fetch, openExternal })
        const challenge = await service.startLogin()
        expect(challenge.userCode).toBe('')
        expect(JSON.stringify(challenge)).not.toContain('private-')
        expect(openExternal).toHaveBeenCalledOnce()
        await vi.advanceTimersByTimeAsync(1500)
        // Let the encrypted write finish before checking the saved identity.
        await vi.waitFor(async () => expect(await store.read()).toBe('private-access'))
        service.dispose()
    })
})
