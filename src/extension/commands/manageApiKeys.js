const vscode = require('vscode');
const {safeErrorDetails} = require('../services/safeErrorDetails');
const {PROVIDERS_UI} = require('../services/providers');

function createManageApiKeysHandler(runtime) {
    return async function manageApiKeysHandler() {
        if (!runtime?.llmRouter) {
            vscode.window.showErrorMessage('GPT extension is not initialized yet.');
            return;
        }

        const items = [];
        for (const provider of PROVIDERS_UI) {
            const key = await runtime.llmRouter.getApiKey(provider.id);
            items.push({
                label: provider.label,
                description: key ? 'Configured' : 'Not set',
                providerId: provider.id
            });
        }

        const pickedProvider = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a provider to manage its API key'
        });

        if (!pickedProvider) return;

        const providerId = pickedProvider.providerId;
        const providerLabel = pickedProvider.label;
        const hasKey = Boolean(await runtime.llmRouter.getApiKey(providerId));

        const action = await vscode.window.showQuickPick(
            [
                {label: 'Set / Update API key', value: 'set'},
                ...(hasKey ? [{label: 'Remove API key', value: 'remove'}] : []),
                {label: 'Cancel', value: 'cancel'}
            ],
            {placeHolder: `${providerLabel} API key`}
        );

        if (!action || action.value === 'cancel') return;

        if (action.value === 'set') {
            const newKey = await vscode.window.showInputBox({
                prompt: `Enter your ${providerLabel} API key`,
                password: true
            });
            if (!newKey || !newKey.trim()) return;

            try {
                const {persisted} = await runtime.llmRouter.setApiKey(providerId, newKey.trim());
                vscode.window.showInformationMessage(
                    persisted
                        ? `${providerLabel} API key updated.`
                        : `${providerLabel} API key set for this session only (Secret Storage unavailable).`
                );
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to update ${providerLabel} API key.`);
                runtime.logDebug('Manage API keys: set failed', safeErrorDetails(err));
            }
            return;
        }

        if (action.value === 'remove') {
            try {
                const {persisted} = await runtime.llmRouter.removeApiKey(providerId);
                vscode.window.showInformationMessage(
                    persisted
                        ? `${providerLabel} API key removed.`
                        : `${providerLabel} API key removed for this session only (Secret Storage unavailable).`
                );
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to remove ${providerLabel} API key.`);
                runtime.logDebug('Manage API keys: remove failed', safeErrorDetails(err));
            }
        }
    };
}

module.exports = {createManageApiKeysHandler};