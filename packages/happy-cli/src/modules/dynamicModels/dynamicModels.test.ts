import { describe, it, expect } from 'vitest'
import {
    claudeModelsToOptions,
    codexModelsToOptions,
    extractModelArg,
    mergeModelsIntoMetadata,
} from './dynamicModels'
import type { Metadata } from '@/api/types'

const baseMeta = (): Metadata => ({
    path: '/tmp',
    host: 'test',
    homeDir: '/home/test',
    happyHomeDir: '/home/test/.happy',
    happyLibDir: '/lib',
    happyToolsDir: '/tools',
})

describe('claudeModelsToOptions', () => {
    it('maps SDK ModelInfo to picker options and drops entries without a value', () => {
        const options = claudeModelsToOptions([
            { value: 'us.anthropic.claude-fable-5-1', displayName: 'Fable', description: 'Fable 5.1' },
            { value: 'default', displayName: 'Default' },
            { value: '' },
            { value: undefined as unknown as string },
        ])
        expect(options).toEqual([
            { code: 'us.anthropic.claude-fable-5-1', value: 'Fable', description: 'Fable 5.1' },
            { code: 'default', value: 'Default', description: null },
        ])
    })
})

describe('codexModelsToOptions', () => {
    it('keeps provider-prefixed IDs verbatim and drops hidden models', () => {
        const options = codexModelsToOptions([
            { id: 'openai.gpt-5.6-sol', displayName: 'GPT-5.6 Sol', description: 'frontier' },
            { id: 'openai.gpt-old', displayName: 'Old', hidden: true },
            { model: 'openai.gpt-5.6-luna' },
        ])
        expect(options).toEqual([
            { code: 'openai.gpt-5.6-sol', value: 'GPT-5.6 Sol', description: 'frontier' },
            { code: 'openai.gpt-5.6-luna', value: 'openai.gpt-5.6-luna', description: null },
        ])
    })
})

describe('mergeModelsIntoMetadata', () => {
    const options = [
        { code: 'default', value: 'Default', description: null },
        { code: 'us.anthropic.claude-fable-5-1', value: 'Fable', description: 'Fable 5.1' },
    ]

    it('publishes rows and pins modelMode to default when nothing was picked', () => {
        const next = mergeModelsIntoMetadata(baseMeta(), options)
        expect(next.models).toEqual(options)
        expect(next.modelMode).toBe('default')
    })

    it('appends a row for a current model the harness list does not contain', () => {
        const meta = { ...baseMeta(), modelMode: 'claude-fable-5' }
        const next = mergeModelsIntoMetadata(meta, options)
        expect(next.models).toEqual([
            ...options,
            { code: 'claude-fable-5', value: 'claude-fable-5', description: 'current model' },
        ])
        // An existing pick is preserved, never rewritten.
        expect(next.modelMode).toBe('claude-fable-5')
    })

    it('uses the spawn-time --model value when metadata has no pick yet', () => {
        const next = mergeModelsIntoMetadata(baseMeta(), options, 'claude-sonnet-5')
        expect(next.modelMode).toBe('claude-sonnet-5')
        expect(next.models?.some((m) => m.code === 'claude-sonnet-5')).toBe(true)
    })

    it('does not duplicate a current model already in the list', () => {
        const meta = { ...baseMeta(), modelMode: 'us.anthropic.claude-fable-5-1' }
        const next = mergeModelsIntoMetadata(meta, options)
        expect(next.models).toEqual(options)
    })

    it('leaves metadata untouched when discovery returned nothing', () => {
        const meta = { ...baseMeta(), models: [{ code: 'x', value: 'X' }] }
        expect(mergeModelsIntoMetadata(meta, [])).toBe(meta)
    })
})

describe('extractModelArg', () => {
    it('extracts the value after --model and null otherwise', () => {
        expect(extractModelArg(['--permission-mode', 'auto', '--model', 'fable'])).toBe('fable')
        expect(extractModelArg(['--model'])).toBeNull()
        expect(extractModelArg([])).toBeNull()
        expect(extractModelArg(undefined)).toBeNull()
    })
})
