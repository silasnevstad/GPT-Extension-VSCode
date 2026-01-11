const axios = require('axios');

const {LLMError, isCancellationError, parseRetryAfterSec, extractRequestId} = require('../errors');

// Gemini API (generativelanguage v1beta) generateContent endpoint:
// POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// Auth: x-goog-api-key header. (Gemini API reference)
const GEMINI_HOST = 'https://generativelanguage.googleapis.com';

/**
 * @param {string} model
 * @returns {string}
 */
function geminiUrl(model) {
    const name = model.startsWith('models/') ? model : `models/${model}`;
    return `${GEMINI_HOST}/v1beta/${name}:generateContent`;
}

/**
 * @param {{ role: 'user'|'assistant', content: string }[]} messages
 * @returns {any[]}
 */
function buildContents(messages) {
    return messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{text: m.content}]
    }));
}

/**
 * @param {any} data
 * @returns {string}
 */
function extractText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map(p => (typeof p?.text === 'string' ? p.text : '')).join('');
}

/**
 * @param {any} err
 * @returns {{ status?: number, providerCode?: string, message?: string, googleStatus?: string }}
 */
function extractGeminiErrorFields(err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    const googleStatus = typeof data?.error?.status === 'string' ? data.error.status : undefined;
    const message = typeof data?.error?.message === 'string'
        ? data.error.message
        : (typeof err?.message === 'string' ? err.message : undefined);

    // Use googleStatus as providerCode.
    return {status, providerCode: googleStatus, message, googleStatus};
}

/**
 * @param {any} err
 * @param {{ provider: 'gemini', model?: string }} ctx
 * @returns {LLMError}
 */
function normalizeError(err, _ctx) {
    if (isCancellationError(err)) {
        return new LLMError({kind: 'Unknown', provider: 'gemini', message: 'Canceled.'});
    }

    // Network / timeout
    if (err?.request && !err?.response) {
        return new LLMError({
            kind: 'Network',
            provider: 'gemini',
            message: 'Network error while contacting Gemini.',
            isRetryable: true
        });
    }

    const {status, providerCode, message, googleStatus} = extractGeminiErrorFields(err);
    const headers = err?.response?.headers;
    const retryAfterSec = parseRetryAfterSec(headers);
    const requestId = extractRequestId(headers);

    const msg = String(message ?? '').toLowerCase();

    /** @type {import('../errors').LLMErrorKind} */
    let kind = 'Unknown';
    let isRetryable = false;

    if (status === 401 || status === 403) {
        kind = 'Auth';
    } else if (status === 404 || googleStatus === 'NOT_FOUND') {
        kind = 'NotFoundModel';
    } else if (status === 429 || googleStatus === 'RESOURCE_EXHAUSTED') {
        kind = 'RateLimit';
        isRetryable = true;
    } else if (status === 400 || googleStatus === 'INVALID_ARGUMENT') {
        if (msg.includes('too large') || msg.includes('too long') || msg.includes('maximum') && msg.includes('tokens')) {
            kind = 'ContextTooLarge';
        } else {
            kind = 'InvalidRequest';
        }
    } else if (status === 500 || status === 503) {
        kind = 'Unknown';
        isRetryable = true;
    }

    return new LLMError({
        kind,
        provider: 'gemini',
        status,
        providerCode,
        retryAfterSec,
        requestId,
        isRetryable,
        message: 'Gemini request failed.'
    });
}

/**
 * @type {import('../provider').LLMProvider}
 */
const provider = {
    id: 'gemini',
    displayName: 'Gemini',

    normalizeError,

    /**
     * @param {import('../provider').SendArgs} args
     * @returns {Promise<import('../provider').SendResult>}
     */
    async send(args) {
        const url = geminiUrl(args.model);

        const headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': args.apiKey
        };

        const system = typeof args.system === 'string' && args.system.trim() ? args.system : undefined;

        const contents = buildContents(args.messages);

        /** @type {any} */
        const body = {
            contents,
            generationConfig: {
                maxOutputTokens: typeof args.maxOutputTokens === 'number' && args.maxOutputTokens > 0 ? args.maxOutputTokens : undefined,
                temperature: typeof args.temperature === 'number' ? args.temperature : undefined,
                topP: typeof args.topP === 'number' ? args.topP : undefined
            }
        };

        if (system) {
            body.systemInstruction = {parts: [{text: system}]};
        }

        // Remove undefined fields from body
        if (body.generationConfig) {
            for (const k of Object.keys(body.generationConfig)) {
                if (body.generationConfig[k] === undefined) delete body.generationConfig[k];
            }
            if (Object.keys(body.generationConfig).length === 0) delete body.generationConfig;
        }

        const attempt = async () => {
            const res = await axios.post(url, body, {
                headers,
                timeout: 120000,
                signal: args.signal
            });

            const requestId = extractRequestId(res.headers);
            return {
                text: extractText(res.data),
                usage: res.data?.usageMetadata,
                requestId,
                status: res.status
            };
        };

        try {
            return await attempt();
        } catch (err) {
            if (isCancellationError(err)) throw err;

            throw normalizeError(err, {provider: 'gemini', model: args.model});
        }
    }
};

module.exports = provider;
