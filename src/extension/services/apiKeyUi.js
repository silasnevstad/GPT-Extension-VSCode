const vscode = require('vscode');
const {safeErrorDetails} = require('./safeErrorDetails');

/**
 * Prompt for a provider API key and store it via router (SecretStorage when available).
 * @param {{ llmRouter: import('../../llm/router').LLMRouter, logDebug: Function }} runtime
 * @param {'openai'|'anthropic'|'gemini'} providerId
 * @param {{ reason?: 'missing'|'invalid'|'manual' }} [opts]
 * @returns {Promise<boolean>}
 */
async function promptSetApiKeyForProvider(runtime, providerId, opts = {}) {
    if (!runtime?.llmRouter) {
        vscode.window.showErrorMessage('GPT extension is not initialized yet.');
        return false;
    }

    const providerLabel = runtime.llmRouter.getProviderDisplayName(providerId);
    const existing = await runtime.llmRouter.getApiKey(providerId);

    const prompt =
        opts.reason === 'invalid'
            ? `Enter a valid ${providerLabel} API key`
            : existing
                ? `Enter a new ${providerLabel} API key`
                : `Enter your ${providerLabel} API key`;

    const newKey = await vscode.window.showInputBox({
        prompt,
        password: true,
        ignoreFocusOut: true
    });

    if (!newKey || !newKey.trim()) return false;

    try {
        const {persisted} = await runtime.llmRouter.setApiKey(providerId, newKey.trim());
        vscode.window.showInformationMessage(
            persisted
                ? `${providerLabel} API key saved.`
                : `${providerLabel} API key set for this session only (Secret Storage unavailable).`
        );
        return true;
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to save ${providerLabel} API key.`);
        runtime.logDebug('Set API key failed', safeErrorDetails(err));
        return false;
    }
}

module.exports = {promptSetApiKeyForProvider};