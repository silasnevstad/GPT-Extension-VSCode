const axios = require('axios');

const { LLMError, isCancellationError, parseRetryAfterSec, extractRequestId } = require('../errors');

// Anthropic Messages API: POST https://api.anthropic.com/v1/messages
// Headers: x-api-key, anthropic-version: 2023-06-01, content-type: application/json
// System prompt is top-level `system` (NOT a system role message). (Anthropic docs)
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * @param {any} data
 * @returns {string}
 */
function extractText(data) {
    /** @type {string[]} */
    const out = [];
    const blocks = Array.isArray(data?.content) ? data.content : [];
    for (const b of blocks) {
        if (b?.type === 'text' && typeof b?.text === 'string') out.push(b.text);
    }
    return out.join('');
}

/**
 * @param {any} err
 * @returns {{ status?: number, providerCode?: string, message?: string, type?: string }}
 */
function extractAnthropicErrorFields(err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    // Anthropic error schema typically includes: { error: { type, message } }
    const type = typeof data?.error?.type === 'string' ? data.error.type : undefined;
    const message = typeof data?.error?.message === 'string'
        ? data.error.message
        : (typeof err?.message === 'string' ? err.message : undefined);

    return { status, providerCode: type, message, type };
}

/**
 * @param {any} err
 * @param {{ provider: 'anthropic', model?: string }} ctx
 * @returns {LLMError}
 */
function normalizeError(err, _ctx) {
    if (isCancellationError(err)) {
        return new LLMError({ kind: 'Unknown', provider: 'anthropic', message: 'Canceled.' });
    }

    // Network / timeout
    if (err?.request && !err?.response) {
        return new LLMError({
            kind: 'Network',
            provider: 'anthropic',
            message: 'Network error while contacting Anthropic.',
            isRetryable: true
        });
    }

    const { status, providerCode, message } = extractAnthropicErrorFields(err);
    const headers = err?.response?.headers;
    const retryAfterSec = parseRetryAfterSec(headers);
    const requestId = extractRequestId(headers);

    const msg = String(message ?? '').toLowerCase();

    /** @type {import('../errors').LLMErrorKind} */
    let kind = 'Unknown';
    let isRetryable = false;

    if (status === 401 || status === 403) {
        kind = 'Auth';
    } else if (status === 404) {
        kind = 'NotFoundModel';
    } else if (status === 429) {
        kind = 'RateLimit';
        isRetryable = true;
    } else if (status === 400) {
        if (msg.includes('too long') || msg.includes('too many tokens') || msg.includes('context')) {
            kind = 'ContextTooLarge';
        } else {
            kind = 'InvalidRequest';
        }
    } else if (status === 529) {
        // Anthropic: 529 is overloaded_error (temporary overload).
        // Treat as retryable transient failure.
        kind = 'Unknown';
        isRetryable = true;
    } else if (status === 500 || status === 503) {
        kind = 'Unknown';
        isRetryable = true;
    }

    return new LLMError({
        kind,
        provider: 'anthropic',
        status,
        providerCode,
        retryAfterSec,
        requestId,
        isRetryable,
        message: 'Anthropic request failed.'
    });
}

/**
 * @type {import('../provider').LLMProvider}
 */
const provider = {
    id: 'anthropic',
    displayName: 'Anthropic',

    normalizeError,

    /**
     * @param {import('../provider').SendArgs} args
     * @returns {Promise<import('../provider').SendResult>}
     */
    async send(args) {
        const headers = {
            'content-type': 'application/json',
            'x-api-key': args.apiKey,
            'anthropic-version': ANTHROPIC_VERSION
        };

        const system = typeof args.system === 'string' && args.system.trim() ? args.system : undefined;

        // max_tokens is required by Anthropic Messages API.
        // If router passes 0/undefined, fall back to a safe default (documented in router). (Anthropic docs)
        const maxTokens = typeof args.maxOutputTokens === 'number' && args.maxOutputTokens > 0
            ? args.maxOutputTokens
            : 1024;

        const body = {
            model: args.model,
            system,
            messages: args.messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: maxTokens,
            temperature: typeof args.temperature === 'number' ? args.temperature : undefined,
            top_p: typeof args.topP === 'number' ? args.topP : undefined
        };

        try {
            const res = await axios.post(ANTHROPIC_MESSAGES_URL, body, {
                headers,
                timeout: 120000,
                signal: args.signal
            });

            const requestId = extractRequestId(res.headers);
            return {
                text: extractText(res.data),
                usage: res.data?.usage,
                requestId,
                status: res.status
            };
        } catch (err) {
            if (isCancellationError(err)) throw err;
            throw normalizeError(err, { provider: 'anthropic', model: args.model });
        }
    }
};

module.exports = provider;
