import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
    app: { getPath: () => tmpdir() },
    shell: { openExternal: vi.fn(async () => undefined) },
    safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value: string) => Buffer.from(value),
        decryptString: (value: Buffer) => value.toString('utf8')
    }
}))

import { ManagedBackendClient } from './managed-backend'

const created: string[] = []

afterEach(async () => {
    await Promise.all(created.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})

async function tempDirectory(): Promise<string> {
    const path = await fs.mkdtemp(join(tmpdir(), 'managed-backend-test-'))
    created.push(path)
    return path
}

describe('ManagedBackendClient', () => {
    it('exchanges the GitHub token once and persists the app session', async () => {
        const calls: string[] = []
        const client = new ManagedBackendClient({
            baseURL: 'https://api.example.test',
            userDataDir: await tempDirectory(),
            getGitHubToken: async () => 'github-secret',
            fetchImpl: vi.fn(async (input) => {
                calls.push(String(input))
                return Response.json({
                    session_token: 'app-session',
                    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
                    user: { id: 'gh_42', login: 'jaimin', name: 'Jaimin', plan: 'free', subscription_status: 'inactive' },
                    usage: { plan: 'free', used_units: 0, limit_units: 1000, remaining_units: 1000, resets_at: new Date().toISOString() }
                })
            }) as typeof fetch
        })

        await expect(client.provider()).resolves.toEqual({
            baseURL: 'https://api.example.test/v1',
            model: 'managed-standard',
            apiKey: 'app-session'
        })
        await expect(client.provider()).resolves.toMatchObject({ apiKey: 'app-session' })
        expect(calls).toEqual(['https://api.example.test/v1/auth/github'])
    })

    it('opens only the Stripe-hosted Checkout URL returned by the backend', async () => {
        const opened: string[] = []
        const client = new ManagedBackendClient({
            baseURL: 'https://api.example.test',
            userDataDir: await tempDirectory(),
            getGitHubToken: async () => 'github-secret',
            openExternal: async (url) => { opened.push(url) },
            fetchImpl: vi.fn(async (input) => {
                if (String(input).endsWith('/v1/auth/github')) {
                    return Response.json({
                        session_token: 'app-session',
                        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
                        user: {},
                        usage: {}
                    })
                }
                return Response.json({ id: 'cs_test', url: 'https://checkout.stripe.com/c/pay/cs_test' })
            }) as typeof fetch
        })

        await client.createCheckout()
        expect(opened).toEqual(['https://checkout.stripe.com/c/pay/cs_test'])
    })

    it('rejects a non-Stripe redirect from the billing response', async () => {
        const client = new ManagedBackendClient({
            baseURL: 'https://api.example.test',
            userDataDir: await tempDirectory(),
            getGitHubToken: async () => 'github-secret',
            fetchImpl: vi.fn(async (input) => {
                if (String(input).endsWith('/v1/auth/github')) {
                    return Response.json({
                        session_token: 'app-session',
                        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
                        user: {},
                        usage: {}
                    })
                }
                return Response.json({ url: 'https://evil.example/steal' })
            }) as typeof fetch
        })

        await expect(client.createCheckout()).rejects.toThrow('unsafe URL')
    })
})
