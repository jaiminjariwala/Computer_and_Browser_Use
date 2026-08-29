import { describe, expect, it } from 'vitest'
import { extractCodeBlocks, primaryCodeBlock } from './codeTheme'

describe('code artifact extraction', () => {
    it('extracts fenced code with its language', () => {
        expect(extractCodeBlocks('Example:\n```ts\nconst answer = 42\n```')).toEqual([
            { language: 'ts', code: 'const answer = 42' }
        ])
    })

    it('selects the largest snippet as the automatic right-panel artifact', () => {
        const markdown = [
            'Install it:',
            '```bash',
            'npm install example',
            '```',
            'Implementation:',
            '```typescript',
            'export function solve(value: string): string {',
            '    return value.trim()',
            '}',
            '```'
        ].join('\n')

        expect(primaryCodeBlock(markdown)).toEqual({
            language: 'typescript',
            code: 'export function solve(value: string): string {\n    return value.trim()\n}'
        })
    })

    it('returns null when the answer contains no generated code', () => {
        expect(primaryCodeBlock('A normal prose answer.')).toBeNull()
    })
})
