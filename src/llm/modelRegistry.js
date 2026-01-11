/**
 * Static model fallbacks + picker helpers.
 * Dynamic discovery is layered on top via modelDiscovery.js.
 */

/**
 * @typedef {{ label: string, id: string, detail?: string }} ModelItem
 */

const PROVIDERS = /** @type {const} */ (['openai', 'anthropic', 'gemini']);

const DEFAULT_MODELS = {
    openai: 'gpt-5.2',
    anthropic: 'claude-sonnet-4-5-20250929',
    gemini: 'gemini-2.5-flash'
};

/* ----------------------- Known Output Caps ------------------------ */
const OPENAI_KNOWN_MAX_OUTPUT_TOKENS = {
    'o3-mini': 100000,
    'o1': 100000,
    'o1-mini': 65536,
    'gpt-4o': 16384,
    'gpt-4o-mini': 16384,
    'gpt-4-turbo': 4096,
    'gpt-3.5-turbo': 4096
};

/* ----------------------- Static Fallback Lists -------------------- */
/** @type {ModelItem[]} */
const OPENAI_MODELS = [
    { label: 'GPT-5.2', id: 'gpt-5.2' },
    { label: 'GPT-5.2 pro', id: 'gpt-5.2-pro' },
    { label: 'GPT-5.1', id: 'gpt-5.1' },
    { label: 'GPT-5', id: 'gpt-5' },
    { label: 'GPT-5 mini', id: 'gpt-5-mini' },
    { label: 'GPT-5 nano', id: 'gpt-5-nano' },
    { label: 'o3', id: 'o3' },
    { label: 'o3-mini', id: 'o3-mini' },
    { label: 'o4-mini', id: 'o4-mini' },
    { label: 'GPT-4.1', id: 'gpt-4.1' },
    { label: 'GPT-4.1 mini', id: 'gpt-4.1-mini' },
    { label: 'GPT-4.1 nano', id: 'gpt-4.1-nano' },
    { label: 'GPT-4o', id: 'gpt-4o' },
    { label: 'GPT-4o mini', id: 'gpt-4o-mini' },
];

/** @type {ModelItem[]} */
const ANTHROPIC_MODELS = [
    { label: 'Claude Sonnet 4.5', id: 'claude-sonnet-4-5-20250929' },
    { label: 'Claude Haiku 4.5', id: 'claude-haiku-4-5-20251001' },
    { label: 'Claude Opus 4.5', id: 'claude-opus-4-5-20251101' },
    { label: 'Claude Opus 4.1', id: 'claude-opus-4-1-20250805' },
    { label: 'Claude Sonnet 4', id: 'claude-sonnet-4-20250514' },
    { label: 'Claude Opus 4', id: 'claude-opus-4-20250514' },
];

/** @type {ModelItem[]} */
const GEMINI_MODELS = [
    { label: 'Gemini 2.5 Flash', id: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro' },
    { label: 'Gemini 2.5 Flash-Lite', id: 'gemini-2.5-flash-lite' },
    { label: 'Gemini 2.0 Flash', id: 'gemini-2.0-flash' },
    { label: 'Gemini 2.0 Flash-Lite', id: 'gemini-2.0-flash-lite' },
];

const CUSTOM_MODEL_ITEM = {
    label: 'Custom model id…',
    id: '__custom__',
    detail: 'Enter any provider model id'
};

const REFRESH_ITEM = {
    label: 'Refresh model list (online)',
    id: '__refresh__',
    detail: 'Fetch latest models from provider'
};

/* ----------------------------- Helpers ---------------------------- */
/**
 * @param {string} providerId
 * @returns {providerId is 'openai'|'anthropic'|'gemini'}
 */
function isProviderId(providerId) {
    return PROVIDERS.includes(/** @type {any} */ (providerId));
}

/**
 * Static fallback models only (no custom / refresh entries).
 * @param {'openai'|'anthropic'|'gemini'} providerId
 * @returns {ModelItem[]}
 */
function staticModels(providerId) {
    switch (providerId) {
        case 'openai': return OPENAI_MODELS;
        case 'anthropic': return ANTHROPIC_MODELS;
        case 'gemini': return GEMINI_MODELS;
        default: return [];
    }
}

/**
 * Build QuickPick-ready model list with required fixed entries.
 * Order:
 *  1) Refresh
 *  2) Models
 *  3) Custom
 *
 * @param {ModelItem[]} models
 * @returns {ModelItem[]}
 */
function buildPickerItems(models) {
    return [
        REFRESH_ITEM,
        ...models,
        CUSTOM_MODEL_ITEM
    ];
}

/**
 * @param {'openai'|'anthropic'|'gemini'} providerId
 * @returns {string}
 */
function getDefaultModel(providerId) {
    return DEFAULT_MODELS[providerId] ?? DEFAULT_MODELS.openai;
}

/**
 * @param {'openai'|'anthropic'|'gemini'} providerId
 * @param {string} modelId
 * @returns {number | null}
 */
function getKnownMaxOutputTokens(providerId, modelId) {
    if (providerId === 'openai') {
        const v = OPENAI_KNOWN_MAX_OUTPUT_TOKENS[modelId];
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    return null;
}

module.exports = {
    isProviderId,
    staticModels,
    buildPickerItems,
    getDefaultModel,
    getKnownMaxOutputTokens
};
