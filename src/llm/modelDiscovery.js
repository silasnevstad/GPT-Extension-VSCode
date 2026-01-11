/**
 * Centralized dynamic model discovery + caching.
 * - Provider-native listing endpoints
 * - Per-provider cache in context.globalState
 * - 24h TTL
 * - Filters out non-text completion models (unless explicitly supported)
 */

const axios = require('axios');
const {isCancellationError} = require('./errors');

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_PAGES = 10;
const MAX_MODELS = 500;

/**
 * @typedef {{ id: string, label: string, detail?: string, meta?: any }} ModelItem
 * @typedef {{ v: 1, fetchedAtMs: number, items: ModelItem[], source: 'remote'|'static' }} ModelsCacheEntry
 */


function nowMs() {
    return Date.now();
}

function cacheKey(providerId) {
    return `modelsCache.${providerId}`;
}

function isValidCacheEntry(raw) {
    return Boolean(
        raw &&
        raw.v === 1 &&
        typeof raw.fetchedAtMs === 'number' &&
        Number.isFinite(raw.fetchedAtMs) &&
        Array.isArray(raw.items) &&
        (raw.source === 'remote' || raw.source === 'static')
    );
}

function asValidCacheEntry(raw) {
    return isValidCacheEntry(raw) ? raw : null;
}

function isFresh(entry) {
    return (
        isValidCacheEntry(entry) &&
        nowMs() - entry.fetchedAtMs < TTL_MS
    );
}

function safePush(arr, item) {
    if (arr.length < MAX_MODELS) arr.push(item);
}

/* ----------------------- Model Filtering -------------------------- */
/**
 * Provider-aware filtering to keep the model picker focused on models that work.
 *
 * "Custom model id…" allows manual entry when needed.
 *
 * @param {'openai'|'anthropic'|'gemini'} providerId
 * @param {any[]} raw
 * @returns {{ id: string, label: string }[]}
 */
function filterAndMapModels(providerId, raw) {
    const arr = Array.isArray(raw) ? raw : [];

    /*  Anthropic  */
    if (providerId === 'anthropic') {
        return arr
            .map(m => ({id: m?.id, label: m?.id}))
            .filter(x => typeof x.id === 'string' && x.id.startsWith('claude-'));
    }

    /*  Gemini  */
    if (providerId === 'gemini') {
        // Gemini provides supportedGenerationMethods
        return arr
            .map(m => {
                const rawName = String(m?.name || '');
                const id = rawName.replace(/^models\//, '');
                // supportedGenerationMethods or supported_actions or supportedActions
                const methods =
                    Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods :
                        Array.isArray(m?.supported_actions) ? m.supported_actions :
                            Array.isArray(m?.supportedActions) ? m.supportedActions :
                                null;
                return {id, label: id, methods};
            })
            .filter(x => typeof x.id === 'string' && x.id.length > 0)
            .filter(x => {
                // Best case: explicit capability metadata
                if (Array.isArray(x.methods)) {
                    return x.methods.includes('generateContent');
                }

                // Fallback heuristic
                const id = x.id.toLowerCase();
                if (id.includes('embedding') || id.includes('embed')) return false;
                if (id.includes('tts') || id.includes('transcribe')) return false;
                if (id.includes('native-audio') || id.includes('audio')) return false;
                if (id.includes('image')) return false;

                return true;
            })
            .map(x => ({id: x.id, label: x.label}));
    }

    /*  OpenAI  */
    // Denylisting + allowlisting.
    const denySubstrings = [
        // Embeddings
        'text-embedding-',
        'embedding-',
        // Moderation
        'omni-moderation',
        'moderation',
        'text-moderation',
        // Image generation
        'dall-e',
        'gpt-image',
        'chatgpt-image',
        'image-',
        // Audio / speech / transcription
        'whisper',
        'transcribe',
        'tts',
        'audio',
        // Realtime / unsupported flows
        'realtime',
        // Legacy base engines
        'davinci',
        'curie',
        'babbage',
        'ada'
    ];

    const allowPrefixes = [
        'gpt-',
        'o1',
        'o3',
        'o4'
    ];

    return arr
        .map(m => ({id: m?.id, label: m?.id}))
        .filter(x => typeof x.id === 'string' && x.id.trim().length > 0)
        .filter(x => {
            const id = x.id.toLowerCase();

            // Hard denylist
            for (const s of denySubstrings) {
                if (id.includes(s)) return false;
            }

            // Known text-capable families
            for (const p of allowPrefixes) {
                if (id.startsWith(p)) return true;
            }

            // Fail closed for unknown families
            return false;
        });
}


/* ----------------------------- OpenAI ----------------------------- */
async function listOpenAIModels({apiKey, signal}) {
    const res = await axios.get('https://api.openai.com/v1/models', {
        headers: {
            Authorization: `Bearer ${apiKey}`
        },
        timeout: 30000,
        signal
    });

    const data = Array.isArray(res.data?.data) ? res.data.data : [];
    return filterAndMapModels('openai', data);
}

/* --------------------------- Anthropic ---------------------------- */
async function listAnthropicModels({ apiKey, signal }) {
    const out = [];
    let afterId = undefined;
    let pages = 0;

    while (pages++ < MAX_PAGES && out.length < MAX_MODELS) {
        const res = await axios.get('https://api.anthropic.com/v1/models', {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            params: {
                limit: 100,
                ...(afterId ? { after_id: afterId } : {})
            },
            timeout: 30000,
            signal
        });

        const items = Array.isArray(res.data?.data) ? res.data.data : [];
        if (items.length === 0) break;

        const filtered = filterAndMapModels('anthropic', items);
        for (const m of filtered) safePush(out, m);

        if (!res.data?.has_more) break;

        afterId = res.data.last_id;
        if (!afterId) break;
    }

    return out;
}

/* ----------------------------- Gemini ----------------------------- */
async function listGeminiModels({apiKey, signal}) {
    /** @type {ModelItem[]} */
    const out = [];
    let pageToken = undefined;
    let pages = 0;

    while (pages++ < MAX_PAGES && out.length < MAX_MODELS) {
        const res = await axios.get(
            'https://generativelanguage.googleapis.com/v1beta/models',
            {
                params: {
                    key: apiKey,
                    pageToken,
                    pageSize: 100
                },
                timeout: 30000,
                signal
            }
        );

        const items = Array.isArray(res.data?.models) ? res.data.models : [];
        const filtered = filterAndMapModels('gemini', items);
        for (const m of filtered) safePush(out, m);

        pageToken = res.data?.nextPageToken;
        if (!pageToken) break;
    }

    return out;
}

/*  Dispatcher  */
async function fetchRemoteModels(providerId, apiKey, signal) {
    if (!apiKey) return null;

    if (providerId === 'openai') {
        return listOpenAIModels({apiKey, signal});
    }
    if (providerId === 'anthropic') {
        return listAnthropicModels({apiKey, signal});
    }
    if (providerId === 'gemini') {
        return listGeminiModels({apiKey, signal});
    }

    return null;
}

/*  Public API  */
/**
 * @param {{
 *   providerId: 'openai'|'anthropic'|'gemini',
 *   context: import('vscode').ExtensionContext,
 *   apiKey: string | null,
 *   force?: boolean,
 *   signal?: AbortSignal,
 *   staticFallback?: ModelItem[]
 * }} args
 * @returns {Promise<ModelsCacheEntry | null>}
 */
async function getModels(args) {
    const {
        providerId,
        context,
        apiKey,
        force = false,
        signal,
        staticFallback = []
    } = args;

    const key = cacheKey(providerId);
    const cachedRaw = context.globalState.get(key);
    const cached = asValidCacheEntry(cachedRaw);

    if (!force && isFresh(cached)) {
        return cached;
    }

    // Never fetch if no API key exists
    if (!apiKey) {
        // Use static fallback if available
        if (!cached && Array.isArray(staticFallback) && staticFallback.length > 0) {
            const entry = {
                v: 1,
                fetchedAtMs: nowMs(),
                items: staticFallback,
                source: 'static'
            };
            await context.globalState.update(key, entry);
            return entry;
        }
        return cached;
    }

    try {
        const items = await fetchRemoteModels(providerId, apiKey, signal);
        if (!Array.isArray(items) || items.length === 0) {
            // If remote yields nothing, fall back to cached (or static)
            if (cached) return cached;
            if (Array.isArray(staticFallback) && staticFallback.length > 0) {
                return {v: 1, fetchedAtMs: nowMs(), items: staticFallback, source: 'static'};
            }
            return null;
        }

        /** @type {ModelsCacheEntry} */
        const entry = {
            v: 1,
            fetchedAtMs: nowMs(),
            items,
            source: 'remote'
        };

        await context.globalState.update(key, entry);
        return entry;
    } catch (err) {
        if (isCancellationError(err)) {
            return cached;
        }
        // fall back silently (or static)
        if (cached) return cached;
        if (Array.isArray(staticFallback) && staticFallback.length > 0) {
            return {v: 1, fetchedAtMs: nowMs(), items: staticFallback, source: 'static'};
        }
        return null;
    }
}

module.exports = {
    getModels,
    TTL_MS
};
