const {LLMError, isLLMError, isCancellationError, sanitizeForDebug} = require('./errors');
const {getDefaultModel, getKnownMaxOutputTokens, isProviderId} = require('./modelRegistry');
const {truncateHeadTail, countRequestChars} = require('./token');

const openaiProvider = require('./providers/openai');
const anthropicProvider = require('./providers/anthropic');
const geminiProvider = require('./providers/gemini');

// Hard safety cap to avoid extension-host stalls when sending very large files/selections.
// (See integration spec: add a 1–2MB character cap.)
const HARD_CHAR_CAP = 1_500_000;

const SECRET_KEY_NAME = {
    openai: 'openaiApiKey',
    anthropic: 'anthropicApiKey',
    gemini: 'geminiApiKey'
};

const MODEL_SETTING_KEY = {
    openai: 'openai.model',
    anthropic: 'anthropic.model',
    gemini: 'gemini.model'
};

const PROVIDER_LABEL = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini'
};

const PROVIDERS = {
    openai: openaiProvider,
    anthropic: anthropicProvider,
    gemini: geminiProvider
};

/**
 * @typedef {{
 *   role: 'user'|'assistant',
 *   content: string,
 *   provider?: string,
 *   model?: string,
 *   timestamp?: number
 * }} HistoryEntry
 */

class LLMRouter {
    /**
     * @param {{
     *   vscode: any,
     *   context: import('vscode').ExtensionContext,
     *   providers?: Record<string, any>,
     *   logDebug?: (msg: string, details?: any) => void,
     *   warnSecretStorageOnce?: () => void,
     *   warnUser?: (msg: string) => void
     * }} deps
     */
    constructor(deps) {
        this._vscode = deps.vscode;
        this._context = deps.context;
        this._logDebug = typeof deps.logDebug === 'function' ? deps.logDebug : () => {
        };
        this._warnSecretStorageOnce = typeof deps.warnSecretStorageOnce === 'function' ? deps.warnSecretStorageOnce : () => {
        };
        this._warnUser = typeof deps.warnUser === 'function' ? deps.warnUser : () => {
        };

        /** @type {Record<'openai'|'anthropic'|'gemini', string | null>} */
        this._ephemeralKeys = {openai: null, anthropic: null, gemini: null};

        /** @type {Record<string, any>} */
        this._providers = deps.providers && typeof deps.providers === 'object' ? deps.providers : PROVIDERS;

        this._warnedPromptTruncation = false;
    }

    /**
     * @returns {any}
     */
    _getConfig() {
        return this._vscode.workspace.getConfiguration('gpthelper');
    }

    /**
     * @returns {'openai'|'anthropic'|'gemini'}
     */
    getActiveProviderId() {
        const cfg = this._getConfig();
        const raw = cfg.get('provider', 'openai');
        return isProviderId(raw) ? raw : 'openai';
    }

    /**
     * Prefer adapter displayName when available (useful for diagnostics).
     * @param {'openai'|'anthropic'|'gemini'} providerId
     * @returns {string}
     */
    getProviderDisplayName(providerId) {
        const provider = this._providers[providerId];
        return provider?.displayName || (PROVIDER_LABEL[providerId] ?? providerId);
    }

    /**
     * @param {'openai'|'anthropic'|'gemini'} providerId
     * @returns {string}
     */
    getModel(providerId) {
        const cfg = this._getConfig();
        const key = MODEL_SETTING_KEY[providerId];
        const raw = key ? cfg.get(key) : undefined;
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        return getDefaultModel(providerId);
    }

    /**
     * @param {'openai'|'anthropic'|'gemini'} _providerId
     * @returns {number}
     */
    getMaxOutputTokensSetting(_providerId) {
        const cfg = this._getConfig();
        const raw = cfg.get('maxOutputTokens', 0);
        const val = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0;
        return val;
    }

    /**
     * @param {'openai'|'anthropic'|'gemini'} providerId
     * @param {string} model
     * @param {number} setting
     * @returns {{ resolved?: number, clampedFrom?: number }}
     */
    _resolveMaxOutputTokens(providerId, model, setting) {
        if (!Number.isFinite(setting)) setting = 0;
        if (setting < 0) {
            throw new LLMError({
                kind: 'InvalidRequest',
                provider: providerId,
                message: 'maxOutputTokens must be >= 0.'
            });
        }

        const knownMax = getKnownMaxOutputTokens(providerId, model);

        // 0 means "use default/max".
        if (setting === 0) {
            if (providerId === 'openai') {
                // Keep backward compatibility: if we know the model max, use it.
                if (typeof knownMax === 'number') return {resolved: knownMax};
                // Unknown model: omit max_output_tokens and let OpenAI default.
                return {resolved: undefined};
            }

            if (providerId === 'anthropic') {
                // Anthropic requires max_tokens; use a safe default if unset.
                // (Anthropic docs: max_tokens required)
                return {resolved: 1024};
            }

            // Gemini: if unset, omit maxOutputTokens to let the API default.
            // (Gemini generateContent reference)
            return {resolved: undefined};
        }

        if (typeof knownMax === 'number' && setting > knownMax) {
            return {resolved: knownMax, clampedFrom: setting};
        }

        return {resolved: setting};
    }

    /**
     * @param {'openai'|'anthropic'|'gemini'} providerId
     * @returns {Promise<string | null>}
     */
    async getApiKey(providerId) {
        const ephemeral = this._ephemeralKeys[providerId];
        if (typeof ephemeral === 'string' && ephemeral.trim()) return ephemeral.trim();

        const storageKey = SECRET_KEY_NAME[providerId];
        if (!storageKey) return null;

        let secret;
        try {
            secret = await this._context.secrets.get(storageKey);
        } catch (err) {
            this._warnSecretStorageOnce();
            this._logDebug('SecretStorage: get failed', sanitizeForDebug({
                provider: providerId,
                error: err?.name,
                code: err?.code
            }));
        }

        if (typeof secret === 'string' && secret.trim()) return secret.trim();

        // Backward compatibility: legacy OpenAI key stored in globalState.openaiApiKey.
        if (providerId === 'openai') {
            const legacy = this._context.globalState.get('openaiApiKey');
            if (typeof legacy === 'string' && legacy.trim()) {
                const legacyTrimmed = legacy.trim();

                // Best-effort migration to SecretStorage without noisy UI.
                try {
                    await this._context.secrets.store('openaiApiKey', legacyTrimmed);
                    try {
                        await this._context.globalState.update('openaiApiKey', undefined);
                    } catch (err) {
                        this._logDebug('Legacy key cleanup failed', sanitizeForDebug({
                            error: err?.name,
                            code: err?.code
                        }));
                    }
                } catch (err) {
                    this._warnSecretStorageOnce();
                    this._logDebug('API key migration failed', sanitizeForDebug({error: err?.name, code: err?.code}));
                }

                return legacyTrimmed;
            }
        }

        return null;
    }

    /**
     * Remove provider API key from SecretStorage (best-effort) and clear in-memory key.
     *
     * @param {'openai'|'anthropic'|'gemini'} providerId
     * @returns {Promise<{ persisted: boolean }>} persisted=true means SecretStorage delete succeeded.
     */
    async removeApiKey(providerId) {
        const storageKey = SECRET_KEY_NAME[providerId];
        if (!storageKey) return {persisted: false};

        // Always clear in-memory value.
        this._ephemeralKeys[providerId] = null;

        let deleted = false;
        try {
            await this._context.secrets.delete(storageKey);
            deleted = true;
        } catch (err) {
            this._warnSecretStorageOnce();
            this._logDebug(
                'SecretStorage: delete failed',
                sanitizeForDebug({provider: providerId, name: err?.name, code: err?.code})
            );
        }

        // Remove legacy globalState key if present.
        if (providerId === 'openai') {
            try {
                await this._context.globalState.update('openaiApiKey', undefined);
            } catch (err) {
                this._logDebug('Legacy key cleanup failed', sanitizeForDebug({name: err?.name, code: err?.code}));
            }
        }

        return { persisted: deleted };
    }

    /**
     * Store provider API key in SecretStorage.
     * Falls back to in-memory only if SecretStorage is unavailable.
     *
     * @param {'openai'|'anthropic'|'gemini'} providerId
     * @param {string} apiKey
     * @returns {Promise<{ persisted: boolean }>} persisted=false means session-only.
     */
    async setApiKey(providerId, apiKey) {
        const storageKey = SECRET_KEY_NAME[providerId];
        const keyTrimmed = typeof apiKey === 'string' ? apiKey.trim() : '';

        if (!keyTrimmed) {
            throw new LLMError({kind: 'InvalidRequest', provider: providerId, message: 'API key is empty.'});
        }

        this._ephemeralKeys[providerId] = keyTrimmed;

        let stored = false;
        try {
            await this._context.secrets.store(storageKey, keyTrimmed);
            stored = true;
        } catch (err) {
            this._warnSecretStorageOnce();
            this._logDebug('SecretStorage: store failed', sanitizeForDebug({
                provider: providerId,
                error: err?.name,
                code: err?.code
            }));
        }

        if (stored && providerId === 'openai') {
            // Remove legacy globalState key if present.
            try {
                await this._context.globalState.update('openaiApiKey', undefined);
            } catch (err) {
                this._logDebug('Legacy key cleanup failed', sanitizeForDebug({error: err?.name, code: err?.code}));
            }
        }

        return {persisted: stored};
    }

    /**
     * @param {'openai'|'anthropic'|'gemini'} providerId
     * @param {string} modelId
     */
    async setModel(providerId, modelId) {
        const cfg = this._getConfig();
        const key = MODEL_SETTING_KEY[providerId];
        if (!key) return;
        await cfg.update(key, modelId, true);
    }

    /**
     * @param {'openai'|'anthropic'|'gemini'} providerId
     */
    async setProvider(providerId) {
        const cfg = this._getConfig();
        await cfg.update('provider', providerId, true);
    }

    /**
     * @param {number} val
     */
    async setMaxOutputTokens(val) {
        const cfg = this._getConfig();
        await cfg.update('maxOutputTokens', val, true);
    }

    /**
     * Apply history selection + provider isolation.
     *
     * @param {HistoryEntry[]} history
     * @param {'openai'|'anthropic'|'gemini'} providerId
     * @param {'none'|'lastN'|'full'} contextMode
     * @param {number} contextLength
     * @returns {{ messages: { role: 'user'|'assistant', content: string }[], droppedLeading: number }}
     */
    _selectHistory(history, providerId, contextMode, contextLength) {
        const normalizedHistory = Array.isArray(history) ? history : [];

        // History isolation: include only matching provider.
        const providerHistory = normalizedHistory.filter(m => {
            const p = typeof m?.provider === 'string' && m.provider.trim() ? m.provider.trim() : 'openai';
            return p === providerId;
        });

        /** @type {HistoryEntry[]} */
        let slice = [];
        if (contextMode === 'full') {
            slice = providerHistory;
        } else if (contextMode === 'lastN') {
            const n = Number.isFinite(contextLength) && contextLength > 0 ? Math.floor(contextLength) : 0;
            slice = n > 0 ? providerHistory.slice(-n) : [];
        } else {
            slice = [];
        }

        // Convert to provider-agnostic message format.
        /** @type {{ role: 'user'|'assistant', content: string }[]} */
        const messages = slice
            .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({role: m.role, content: m.content}));

        // Ensure history starts with a user message (important for providers like Gemini).
        let droppedLeading = 0;
        while (messages.length > 0 && messages[0].role === 'assistant') {
            messages.shift();
            droppedLeading++;
        }

        return {messages, droppedLeading};
    }

    /**
     * Enforce HARD_CHAR_CAP by dropping oldest history messages first, then truncating
     * user/system text if necessary.
     *
     * @param {string} system
     * @param {{ role: 'user'|'assistant', content: string }[]} messages (history + final user message)
     * @returns {{ system: string, messages: { role: 'user'|'assistant', content: string }[], meta: { droppedHistory: number, truncatedUser: boolean, truncatedSystem: boolean, totalCharsBefore: number, totalCharsAfter: number } }}
     */
    _enforceCharCap(system, messages) {
        let systemText = typeof system === 'string' ? system : '';
        let msgs = Array.isArray(messages) ? [...messages] : [];

        const before = countRequestChars(systemText, msgs).totalChars;

        let droppedHistory = 0;
        let truncatedUser = false;
        let truncatedSystem = false;

        // Prefer dropping oldest history messages (never drop the last user prompt).
        while (msgs.length > 1) {
            const {totalChars} = countRequestChars(systemText, msgs);
            if (totalChars <= HARD_CHAR_CAP) break;
            const dropped = msgs.shift();
            if (dropped) droppedHistory++;
        }

        // If still over cap, truncate the current user prompt.
        if (msgs.length > 0) {
            const userIdx = msgs.length - 1;
            const userMsg = msgs[userIdx];

            const nonUserChars = countRequestChars(systemText, msgs.slice(0, userIdx)).totalChars;
            const availableForUser = Math.max(0, HARD_CHAR_CAP - nonUserChars);

            if (userMsg && typeof userMsg.content === 'string' && userMsg.content.length > availableForUser) {
                const t = truncateHeadTail(userMsg.content, availableForUser);
                msgs[userIdx] = {...userMsg, content: t.text};
                truncatedUser = true;
            }
        }

        // If still over cap, truncate system.
        {
            const msgsChars = countRequestChars('', msgs).totalChars;
            const availableForSystem = Math.max(0, HARD_CHAR_CAP - msgsChars);
            if (systemText.length > availableForSystem) {
                const t = truncateHeadTail(systemText, availableForSystem);
                systemText = t.text;
                truncatedSystem = true;
            }
        }

        const after = countRequestChars(systemText, msgs).totalChars;

        return {
            system: systemText,
            messages: msgs,
            meta: {
                droppedHistory,
                truncatedUser,
                truncatedSystem,
                totalCharsBefore: before,
                totalCharsAfter: after
            }
        };
    }

    /**
     * @param {{ role: 'user'|'assistant', content: string }[]} messages
     * @returns {{ role: 'user'|'assistant', content: string }[]}
     */
    _reduceHistoryForRetry(messages) {
        if (!Array.isArray(messages) || messages.length === 0) return [];
        // Keep the last few history messages to preserve immediate context.
        const keep = Math.min(messages.length, 6);
        return messages.slice(-keep);
    }

    /**
     * @param {string} userPrompt
     * @returns {string}
     */
    _truncateUserForRetry(userPrompt) {
        const max = 200_000;
        if (typeof userPrompt !== 'string') return '';
        if (userPrompt.length <= max) return userPrompt;
        return truncateHeadTail(userPrompt, max).text;
    }

    /**
     * Send a request to the currently-selected provider.
     *
     * @param {{
     *   userPrompt: string,
     *   system?: string,
     *   history: HistoryEntry[],
     *   contextMode: 'none'|'lastN'|'full',
     *   contextLength: number,
     *   temperature?: number|null,
     *   topP?: number|null,
     *   signal?: AbortSignal,
     *   debug?: boolean
     * }} args
     * @returns {Promise<{ text: string, provider: 'openai'|'anthropic'|'gemini', model: string, requestId?: string, usage?: any } | null>}
     */
    async send(args) {
        const providerId = this.getActiveProviderId();
        const provider = this._providers[providerId];
        const model = this.getModel(providerId);

        if (!provider || typeof provider.send !== 'function') {
            throw new LLMError({
                kind: 'NotFoundEndpoint',
                provider: providerId,
                message: 'Provider adapter not available.'
            });
        }

        const apiKey = await this.getApiKey(providerId);
        if (!apiKey) {
            throw new LLMError({kind: 'Auth', provider: providerId, message: 'Missing API key.'});
        }

        const maxSetting = this.getMaxOutputTokensSetting(providerId);
        const {resolved: maxOutputTokens, clampedFrom} = this._resolveMaxOutputTokens(providerId, model, maxSetting);

        const system = typeof args.system === 'string' ? args.system : '';

        const {messages: historyMessages, droppedLeading} = this._selectHistory(
            args.history,
            providerId,
            args.contextMode,
            args.contextLength
        );

        /** @type {{ role: 'user'|'assistant', content: string }[]} */
        const messages = [...historyMessages, {role: 'user', content: args.userPrompt}];

        const preCapCounts = countRequestChars(system, messages);

        const capped = this._enforceCharCap(system, messages);

        if ((capped.meta.truncatedUser || capped.meta.truncatedSystem || capped.meta.droppedHistory > 0) && !this._warnedPromptTruncation) {
            this._warnedPromptTruncation = true;
            this._warnUser('Input was truncated to fit safety limits (large selection/file or extensive history).');
        }

        // Warn if Anthropic is in an invalid sampling state (both temperature and top-p set)
        if (
            providerId === 'anthropic' &&
            typeof args.temperature === 'number' &&
            typeof args.topP === 'number'
        ) {
            this._warnUser(
                'Anthropic models do not support using both temperature and top-p. ' +
                'This request will use temperature and ignore top-p.'
            );
        }

        // Normalize sampling params
        let temperature = typeof args.temperature === 'number' ? args.temperature : undefined;
        let topP = typeof args.topP === 'number' ? args.topP : undefined;

        if (providerId === 'anthropic') {
            if (typeof temperature === 'number') {
                topP = undefined;
            } else if (typeof topP === 'number') {
                temperature = undefined;
            }
        }

        this._logDebug('LLM request', sanitizeForDebug({
            provider: providerId,
            model,
            contextMode: args.contextMode,
            contextLength: args.contextLength,
            droppedLeadingHistoryMessages: droppedLeading,
            maxOutputTokensSetting: maxSetting,
            resolvedMaxOutputTokens: maxOutputTokens,
            clampedFrom,
            temperatureSent: temperature,
            topPSent: topP,
            temperatureRaw: args.temperature ?? undefined,
            topPRaw: args.topP ?? undefined,
            instructionChars: preCapCounts.systemChars,
            historyChars: preCapCounts.messagesChars - (typeof args.userPrompt === 'string' ? args.userPrompt.length : 0),
            userChars: typeof args.userPrompt === 'string' ? args.userPrompt.length : 0,
            totalChars: preCapCounts.totalChars,
            totalCharsAfterCap: capped.meta.totalCharsAfter,
            droppedHistory: capped.meta.droppedHistory,
            truncatedUser: capped.meta.truncatedUser,
            truncatedSystem: capped.meta.truncatedSystem
        }));

        const sendOnce = async (systemText, msgs) => {
            const res = await provider.send({
                apiKey,
                model,
                system: systemText,
                messages: msgs,
                maxOutputTokens,
                temperature,
                topP,
                signal: args.signal,
                debug: args.debug
            });

            return res;
        };

        let retried = false;

        try {
            const res = await sendOnce(capped.system, capped.messages);
            return {
                text: res.text,
                provider: providerId,
                model,
                requestId: res.requestId,
                usage: res.usage
            };
        } catch (err) {
            if (args.signal?.aborted === true || isCancellationError(err)) {
                this._logDebug('LLM request canceled', sanitizeForDebug({provider: providerId, model}));
                return null;
            }

            const normalized = isLLMError(err) ? err : provider.normalizeError(err, {provider: providerId, model});

            if (!retried && normalized.kind === 'ContextTooLarge') {
                retried = true;

                const historyOnly = capped.messages.slice(0, -1);
                const user = capped.messages[capped.messages.length - 1];

                const reducedHistory = this._reduceHistoryForRetry(historyOnly);
                const reducedUser = this._truncateUserForRetry(user?.content ?? '');

                const retryMessages = [...reducedHistory, {role: 'user', content: reducedUser}];
                const retryCapped = this._enforceCharCap(capped.system, retryMessages);

                this._logDebug('Retrying after ContextTooLarge', sanitizeForDebug({
                    provider: providerId,
                    model,
                    attempt: 2,
                    originalTotalChars: capped.meta.totalCharsAfter,
                    retryTotalChars: retryCapped.meta.totalCharsAfter,
                    retryDroppedHistory: retryCapped.meta.droppedHistory,
                    retryTruncatedUser: retryCapped.meta.truncatedUser
                }));

                try {
                    const res2 = await sendOnce(retryCapped.system, retryCapped.messages);
                    return {
                        text: res2.text,
                        provider: providerId,
                        model,
                        requestId: res2.requestId,
                        usage: res2.usage
                    };
                } catch (err2) {
                    if (args.signal?.aborted === true || isCancellationError(err2)) {
                        this._logDebug('LLM request canceled', sanitizeForDebug({provider: providerId, model}));
                        return null;
                    }

                    const normalized2 = isLLMError(err2) ? err2 : provider.normalizeError(err2, {
                        provider: providerId,
                        model
                    });
                    throw normalized2;
                }
            }

            throw normalized;
        }
    }
}

module.exports = {
    LLMRouter
};
