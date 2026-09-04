/**
 * Dynamic model discovery.
 *
 * Both code harnesses can report the models they actually support — Claude
 * via the Agent SDK's `supportedModels()` control request, Codex via the
 * app-server `model/list` method — with IDs already resolved for the active
 * backend (e.g. Bedrock inference profiles like `us.anthropic.claude-fable-5-1`
 * or provider-prefixed `openai.gpt-5.6-sol`). Publishing those lists into
 * session metadata (`metadata.models`) lets the app render a live model
 * picker instead of a hardcoded catalog that goes stale with every model
 * release, and lets picked keys be IDs the backend actually accepts
 * (hardcoded bare slugs 404 on Bedrock's OpenAI endpoint).
 *
 * The app already prefers `metadata.models` over its hardcoded lists for
 * every flavor (getAvailableModels in modelModeOptions.ts); these helpers
 * produce that shape.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { CodexAppServerClient } from '@/codex/codexAppServerClient'
import type { Metadata } from '@/api/types'

/** `code` = protocol value forwarded to `--model`, `value` = human label. */
export type DynamicModelOption = { code: string; value: string; description?: string | null }

/** Subset of the Agent SDK's ModelInfo that the picker needs. */
export type ClaudeModelInfo = { value: string; displayName?: string; description?: string | null }

export function claudeModelsToOptions(models: ClaudeModelInfo[]): DynamicModelOption[] {
    return models
        .filter((m) => typeof m?.value === 'string' && m.value.length > 0)
        .map((m) => ({ code: m.value, value: m.displayName || m.value, description: m.description ?? null }))
}

/** Subset of Codex app-server `model/list` entries that the picker needs. */
export type CodexModelInfo = { id?: string; model?: string; displayName?: string; description?: string | null; hidden?: boolean }

export function codexModelsToOptions(models: CodexModelInfo[]): DynamicModelOption[] {
    return models
        .filter((m) => !m?.hidden && typeof (m?.id ?? m?.model) === 'string')
        .map((m) => {
            const code = (m.id ?? m.model) as string
            return { code, value: m.displayName || code, description: m.description ?? null }
        })
}

/**
 * Merge a discovered model list into session metadata.
 *
 * Beyond publishing the rows, two invariants keep the app's current-model
 * chip resolvable (resolveCurrentOption falls back to a generic "MODEL"
 * label when the selected key matches no row):
 *
 * - A session's current model (picked before this list existed, or passed
 *   via `--model` at spawn) may not appear in the harness list verbatim —
 *   append it so the selection still has a row, mirroring what
 *   includeConfiguredModel does app-side for Codex custom models.
 * - A session with no explicit pick previously resolved through the app's
 *   hardcoded per-flavor default key, which the dynamic list need not
 *   contain. Pin `modelMode` so resolution goes through the published rows
 *   instead. `default` is safe: the CLI treats it as "no --model override"
 *   everywhere modelMode is forwarded.
 *
 * Never replaces an existing list with nothing: empty discovery results
 * leave the metadata untouched so a transient harness failure can't blank
 * the picker.
 */
export function mergeModelsIntoMetadata(
    meta: Metadata,
    options: DynamicModelOption[],
    currentModel?: string | null,
): Metadata {
    if (options.length === 0) {
        return meta
    }
    const rows = [...options]
    const current = meta.modelMode ?? currentModel ?? null
    if (current && current !== 'default' && !rows.some((r) => r.code === current)) {
        rows.push({ code: current, value: current, description: 'current model' })
    }
    const next: Metadata = { ...meta, models: rows }
    if (!meta.modelMode) {
        next.modelMode = current ?? 'default'
    }
    return next
}

/**
 * One-shot Claude model discovery for contexts without a live session (the
 * daemon's machine-level catalog). The SDK's control channel is available as
 * soon as query() returns and no user turn is ever sent; close() reaps the
 * spawned harness process.
 */
export async function fetchClaudeModelOptions(): Promise<DynamicModelOption[]> {
    const q = query({
        prompt: (async function* () { })() as any,
        options: {},
    })
    try {
        const models = await q.supportedModels()
        return claudeModelsToOptions(models as ClaudeModelInfo[])
    } finally {
        q.close()
    }
}

/**
 * One-shot Codex model discovery for contexts without a live session. Same
 * connect/disconnect lifecycle the machine RPC handlers use for their
 * temporary app-server clients.
 */
export async function fetchCodexModelOptions(): Promise<DynamicModelOption[]> {
    const client = new CodexAppServerClient()
    await client.connect()
    try {
        return codexModelsToOptions(await client.listModels())
    } finally {
        await client.disconnect()
    }
}

/**
 * Extract the value following `--model` from a raw CLI arg list (the shape
 * sessions receive from the daemon/app). Returns null when absent.
 */
export function extractModelArg(args: string[] | undefined): string | null {
    if (!args) return null
    for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === '--model') {
            return args[i + 1] || null
        }
    }
    return null
}
