/**
 * Error taxonomy + safe debug logging helpers.
 */

/**
 * @typedef {'Auth'|'RateLimit'|'NotFoundModel'|'NotFoundEndpoint'|'InvalidRequest'|'ContextTooLarge'|'Network'|'Unknown'} LLMErrorKind
 */

const REQUIRED_KINDS = /** @type {const} */ ([
    'Auth',
    'RateLimit',
    'NotFoundModel',
    'NotFoundEndpoint',
    'InvalidRequest',
    'ContextTooLarge',
    'Network',
    'Unknown'
]);

/**
 * @param {any} v
 * @returns {v is Record<string, any>}
 */
function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {any} v
 * @returns {v is string}
 */
function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

/**
 * @param {any} headers
 * @returns {number | undefined}
 */
function parseRetryAfterSec(headers) {
    const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
    if (!raw) return undefined;

    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));

    if (typeof raw === 'string') {
        const asNum = parseInt(raw, 10);
        if (!Number.isNaN(asNum) && Number.isFinite(asNum)) return Math.max(0, asNum);

        const asDateMs = Date.parse(raw);
        if (!Number.isNaN(asDateMs)) {
            const deltaSec = Math.ceil((asDateMs - Date.now()) / 1000);
            if (Number.isFinite(deltaSec)) return Math.max(0, deltaSec);
        }
    }

    return undefined;
}

/**
 * Extract a best-effort request id from common headers.
 * @param {any} headers
 * @returns {string | undefined}
 */
function extractRequestId(headers) {
    if (!headers) return undefined;
    const candidates = [
        headers['x-request-id'],
        headers['x-requestid'],
        headers['request-id'],
        headers['x-amzn-requestid'],
        headers['x-amz-request-id'],
        headers['openai-request-id']
    ];

    for (const v of candidates) {
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return undefined;
}

/**
 * A normalized error shape used throughout the extension.
 */
class LLMError extends Error {
    /**
     * @param {{
     *   kind: LLMErrorKind,
     *   provider: 'openai'|'anthropic'|'gemini',
     *   message: string,
     *   status?: number,
     *   providerCode?: string,
     *   retryAfterSec?: number,
     *   requestId?: string,
     *   isRetryable?: boolean
     * }} params
     */
    constructor(params) {
        super(params.message);

        /** @type {LLMErrorKind} */
        this.kind = params.kind;
        /** @type {'openai'|'anthropic'|'gemini'} */
        this.provider = params.provider;
        /** @type {number | undefined} */
        this.status = params.status;
        /** @type {string | undefined} */
        this.providerCode = params.providerCode;
        /** @type {number | undefined} */
        this.retryAfterSec = params.retryAfterSec;
        /** @type {string | undefined} */
        this.requestId = params.requestId;
        /** @type {boolean | undefined} */
        this.isRetryable = params.isRetryable;

        // Preserve class name in stack traces.
        this.name = 'LLMError';
    }
}

/**
 * @param {any} err
 * @returns {err is LLMError}
 */
function isLLMError(err) {
    return Boolean(err && typeof err === 'object' && err.name === 'LLMError' && REQUIRED_KINDS.includes(err.kind));
}

/**
 * Axios cancellation has a few shapes across versions. Keep detection permissive.
 * @param {any} err
 * @returns {boolean}
 */
function isCancellationError(err) {
    if (!err) return false;
    if (err.code === 'ERR_CANCELED') return true;
    if (err.name === 'CanceledError') return true;
    // Some environments propagate AbortError
    if (err.name === 'AbortError') return true;
    return false;
}

/**
 * Generic axios error normalizer. Provider adapters should prefer their
 * own mapping, but this is useful as a fallback.
 *
 * @param {{ provider: 'openai'|'anthropic'|'gemini', err: any, responseHints?: { kind?: LLMErrorKind } }} params
 * @returns {LLMError}
 */
function fromAxiosError(params) {
    const { provider, err, responseHints } = params;

    // Network / timeout (no response)
    if (err?.request && !err?.response) {
        return new LLMError({
            kind: 'Network',
            provider,
            message: 'Network error while contacting the provider.',
            isRetryable: true
        });
    }

    const status = err?.response?.status;
    const headers = err?.response?.headers;
    const retryAfterSec = parseRetryAfterSec(headers);
    const requestId = extractRequestId(headers);

    const kind = responseHints?.kind ?? 'Unknown';

    return new LLMError({
        kind,
        provider,
        status,
        retryAfterSec,
        requestId,
        message: 'Request failed.'
    });
}

const SECRET_KEY_PATTERN = /^(authorization|x-api-key|x-goog-api-key|api[-_]?key|key|token|password)$/i;
const SAFE_STRING_KEYS = new Set([
    'name',
    'code',
    'provider',
    'providerLabel',
    'model',
    'host',
    'path',
    'method',
    'status',
    'requestId',
    'retryAfterSec',
    'errorKind',
    'providerCode',
    'command',
    'endpoint',
    'url'
]);

/**
 * Sanitizes arbitrary objects for debug logging.
 * - Redacts secret-ish keys (Authorization, API keys)
 * - Never logs prompt content: all string values are summarized by default
 *   (only allow-listed keys can emit raw short strings).
 *
 * @param {any} input
 * @param {number} [depth]
 * @returns {any}
 */
function sanitizeForDebug(input, depth = 0) {
    const MAX_DEPTH = 4;
    if (depth > MAX_DEPTH) return '[Truncated]';

    if (input === null || input === undefined) return input;

    const t = typeof input;
    if (t === 'number' || t === 'boolean') return input;

    if (t === 'string') {
        // Never log raw strings by default; they may contain prompt content.
        return `[string len=${input.length}]`;
    }

    if (Array.isArray(input)) {
        if (input.length === 0) return [];
        if (depth >= MAX_DEPTH) return `[array len=${input.length}]`;
        // Only keep a small prefix to avoid massive logs.
        const slice = input.slice(0, 20).map(v => sanitizeForDebug(v, depth + 1));
        if (input.length > slice.length) slice.push(`[+${input.length - slice.length} more]`);
        return slice;
    }

    if (!isObject(input)) {
        return `[${Object.prototype.toString.call(input)}]`;
    }

    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        if (SECRET_KEY_PATTERN.test(k)) {
            out[k] = '[REDACTED]';
            continue;
        }

        if (k.toLowerCase() === 'headers') {
            // Never emit header values.
            out[k] = isObject(v) ? { redacted: true, keys: Object.keys(v) } : '[REDACTED]';
            continue;
        }

        if (typeof v === 'string') {
            if (SAFE_STRING_KEYS.has(k)) {
                // Allow-list meta keys; still cap length to avoid accidental leakage.
                out[k] = v.length <= 200 ? v : `[string len=${v.length}]`;
            } else {
                out[k] = `[string len=${v.length}]`;
            }
            continue;
        }

        out[k] = sanitizeForDebug(v, depth + 1);
    }
    return out;
}

/**
 * @param {LLMError | any} err
 * @param {{
 *   providerLabel: string,
 *   model?: string,
 *   commandHints?: { setKey?: string, changeModel?: string }
 * }} ctx
 * @returns {string}
 */
function toUserMessage(err, ctx) {
    const providerLabel = ctx.providerLabel;
    const model = ctx.model;
    const setKeyCmd = ctx.commandHints?.setKey ?? 'GPT: Manage API Keys';
    const changeModelCmd = ctx.commandHints?.changeModel ?? 'GPT: Change Model';

    const requestId = isNonEmptyString(err?.requestId) ? err.requestId : undefined;
    const retryAfterSec = typeof err?.retryAfterSec === 'number' ? err.retryAfterSec : undefined;

    const modelSuffix = model ? ` (${model})` : '';

    /** @type {string[]} */
    const lines = [];

    const kind = isLLMError(err) ? err.kind : 'Unknown';

    // Anthropic overload: HTTP 529 with providerCode "overloaded_error".
    const isAnthropicOverload =
        isLLMError(err) &&
        err.provider === 'anthropic' &&
        (err.status === 529 || (typeof err.providerCode === 'string' && err.providerCode === 'overloaded_error'));

    if (isAnthropicOverload) {
        lines.push('Anthropic is temporarily overloaded.');
        if (typeof retryAfterSec === 'number') lines.push(`Retry after ~${retryAfterSec}s.`);
        else lines.push('Try again in a moment.');
        if (requestId) lines.push(`Request ID: ${requestId}`);
        return lines.join(' ');
    }

    switch (kind) {
        case 'Auth':
            lines.push(`${providerLabel} API key is missing or invalid.`);
            lines.push(`Run '${setKeyCmd}' to set or update your API key.`);
            break;
        case 'NotFoundModel':
            lines.push(`Model not available for ${providerLabel}${modelSuffix}.`);
            lines.push(`Run '${changeModelCmd}' to refresh the model list or select a different model.`);
            break;
        case 'NotFoundEndpoint':
            lines.push(`${providerLabel} endpoint not found or unreachable.`);
            lines.push('Check network connectivity, proxy settings, or corporate firewall rules.');
            break;
        case 'ContextTooLarge':
            lines.push(`Input is too large for ${providerLabel}${modelSuffix}.`);
            lines.push('Reduce selection/file size, lower context mode, or lower max output tokens.');
            break;
        case 'RateLimit':
            lines.push(`${providerLabel} rate limit or quota exceeded.`);
            if (typeof retryAfterSec === 'number') {
                lines.push(`Retry after ~${retryAfterSec}s.`);
            } else {
                lines.push('Retry later, or check your plan/quota in the provider dashboard.');
            }
            break;
        case 'Network':
            lines.push(`Network error contacting ${providerLabel}.`);
            lines.push('Check connectivity and try again.');
            break;
        case 'InvalidRequest':
            lines.push(`Invalid request sent to ${providerLabel}${modelSuffix}.`);
            lines.push(`Try '${changeModelCmd}', or reduce prompt size.`);
            break;
        case 'Unknown':
        default:
            lines.push(`${providerLabel} request failed${modelSuffix}.`);
            lines.push('Try again. If this persists, check the debug log for request metadata.');
            break;
    }

    if (requestId) {
        lines.push(`Request ID: ${requestId}`);
    }

    return lines.join(' ');
}

module.exports = {
    LLMError,
    isLLMError,
    isCancellationError,
    fromAxiosError,
    sanitizeForDebug,
    toUserMessage,
    parseRetryAfterSec,
    extractRequestId
};
