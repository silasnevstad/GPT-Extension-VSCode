const axios = require('axios');

const {LLMError, isCancellationError, parseRetryAfterSec, extractRequestId} = require('../errors');

// OpenAI Responses API: POST https://api.openai.com/v1/responses
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

/**
 * @param {{ role: 'user'|'assistant', content: string }[]} messages
 * @returns {string}
 */
function buildInputText(messages) {
    const arr = Array.isArray(messages) ? messages : [];
    return arr
        .map(m => {
            const role = m?.role === 'assistant' ? 'Assistant' : 'User';
            const text = typeof m?.content === 'string' ? m.content : '';
            return text ? `${role}: ${text}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
}

/**
 * @param {any} data
 * @returns {string}
 */
function extractOutputText(data) {
    if (typeof data?.output_text === 'string') return data.output_text;

    /** @type {string[]} */
    const parts = [];

    const output = Array.isArray(data?.output) ? data.output : [];
    for (const item of output) {
        const content = Array.isArray(item?.content) ? item.content : [];
        for (const block of content) {
            const text = block?.text;
            if (typeof text === 'string' && text.length > 0) parts.push(text);
        }
    }

    return parts.join('');
}

/**
 * @param {any} err
 * @returns {{ status?: number, providerCode?: string, message?: string }}
 */
function extractOpenAIErrorFields(err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    const providerCode = typeof data?.error?.code === 'string'
        ? data.error.code
        : (typeof data?.error?.type === 'string' ? data.error.type : undefined);

    const message = typeof data?.error?.message === 'string'
        ? data.error.message
        : (typeof err?.message === 'string' ? err.message : undefined);

    return {status, providerCode, message};
}

/**
 * @param {any} err
 * @param {{ provider: 'openai', model?: string }} ctx
 * @returns {LLMError}
 */
function normalizeError(err, _ctx) {
    if (isCancellationError(err)) {
        return new LLMError({kind: 'Unknown', provider: 'openai', message: 'Canceled.'});
    }

    // Network / timeout
    if (err?.request && !err?.response) {
        return new LLMError({
            kind: 'Network',
            provider: 'openai',
            message: 'Network error while contacting OpenAI.',
            isRetryable: true
        });
    }

    const {status, providerCode, message} = extractOpenAIErrorFields(err);
    const headers = err?.response?.headers;
    const retryAfterSec = parseRetryAfterSec(headers);
    const requestId = extractRequestId(headers);

    const msg = String(message ?? '').toLowerCase();

    /** @type {import('../errors').LLMErrorKind} */
    let kind = 'Unknown';
    let isRetryable = false;

    if (status === 401) {
        kind = 'Auth';
    } else if (status === 403) {
        // 403 can also indicate unsupported region (OpenAI error codes guide)
        kind = 'Auth';
    } else if (status === 404) {
        // Distinguish model-not-found vs endpoint-not-found
        if (providerCode === 'model_not_found' || msg.includes('model') && msg.includes('not found')) {
            kind = 'NotFoundModel';
        } else {
            kind = 'NotFoundEndpoint';
        }
    } else if (status === 429) {
        // Rate limit vs quota guidance (OpenAI error codes guide)
        kind = 'RateLimit';
        isRetryable = true;
        if (providerCode === 'insufficient_quota' || msg.includes('check your plan and billing details')) {
            isRetryable = false;
        }
    } else if (status === 400) {
        if (msg.includes('context') && msg.includes('length') || msg.includes('too many tokens') || msg.includes('maximum context')) {
            kind = 'ContextTooLarge';
        } else {
            kind = 'InvalidRequest';
        }
    } else if (status === 500) {
        kind = 'Unknown';
        isRetryable = true;
    } else if (status === 503) {
        kind = 'Unknown';
        isRetryable = true;
    }

    return new LLMError({
        kind,
        provider: 'openai',
        status,
        providerCode,
        retryAfterSec,
        requestId,
        isRetryable,
        // Do not surface upstream message verbatim (may include details we don't want to echo).
        message: 'OpenAI request failed.'
    });
}

/**
 * @type {import('../provider').LLMProvider}
 */
const provider = {
    id: 'openai',
    displayName: 'OpenAI',

    normalizeError,

    /**
     * @param {import('../provider').SendArgs} args
     * @returns {Promise<import('../provider').SendResult>}
     */
    async send(args) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${args.apiKey}`
        };

        const system = typeof args.system === 'string' && args.system.trim() ? args.system : undefined;

        const body = {
            model: args.model,
            instructions: system,
            input: buildInputText(args.messages),
            max_output_tokens: typeof args.maxOutputTokens === 'number' && args.maxOutputTokens > 0 ? args.maxOutputTokens : undefined,
            temperature: typeof args.temperature === 'number' ? args.temperature : undefined,
            top_p: typeof args.topP === 'number' ? args.topP : undefined
        };

        try {
            const res = await axios.post(OPENAI_RESPONSES_URL, body, {
                headers,
                timeout: 120000,
                signal: args.signal
            });

            const requestId = extractRequestId(res.headers);
            const text = extractOutputText(res.data);

            return {
                text,
                usage: res.data?.usage,
                requestId,
                status: res.status
            };
        } catch (err) {
            if (isCancellationError(err)) throw err;
            throw normalizeError(err, { provider: 'openai', model: args.model });
        }
    }
};

module.exports = provider;
