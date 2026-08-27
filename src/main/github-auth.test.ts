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
})
