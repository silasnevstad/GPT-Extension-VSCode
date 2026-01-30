const vscode = require('vscode');
const {promptSetApiKeyForProvider} = require('../services/apiKeyUi');
const {PROVIDERS_UI} = require('../services/providers');

function createChangeProviderHandler(runtime) {
    return async function changeProviderHandler() {
        const currentProvider = runtime.llmRouter.getActiveProviderId();

        const items = PROVIDERS_UI.map(p => ({
            label: p.id === currentProvider ? `$(check) ${p.label}` : p.label,
            value: p.id,
            picked: p.id === currentProvider
        }));

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an LLM provider'
        });

        if (!pick) return;

        await vscode.workspace
            .getConfiguration('gpthelper')
            .update('provider', pick.value, vscode.ConfigurationTarget.Global);

        const key = await runtime.llmRouter.getApiKey(pick.value);
        if (!key) {
            const action = await vscode.window.showWarningMessage(
                `${pick.label.replace('$(check) ', '')} is selected but no API key is configured. Set one now?`,
                'Set API Key',
                'Cancel'
            );
            if (action === 'Set API Key') {
                await promptSetApiKeyForProvider(runtime, pick.value, { reason: 'missing' });
            }
        }

        vscode.window.showInformationMessage(
            `Provider set to: ${pick.label.replace('$(check) ', '')}`
        );
        runtime.logDebug('Provider changed', {provider: pick.value});
    };
}

module.exports = {createChangeProviderHandler};