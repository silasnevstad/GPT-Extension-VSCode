const vscode = require('vscode');
const {promptSetApiKeyForProvider} = require('../services/apiKeyUi');
const {PROVIDERS_UI} = require('../services/providers');

function createSetupHandler(runtime) {
    return async function setupHandler() {
        if (!runtime?.llmRouter) {
            vscode.window.showErrorMessage('GPT extension is not initialized yet.');
            return;
        }

        const currentProvider = runtime.llmRouter.getActiveProviderId();

        const pick = await vscode.window.showQuickPick(
            PROVIDERS_UI.map(p => ({
                label: p.id === currentProvider ? `$(check) ${p.label}` : p.label,
                description: p.description,
                value: p.id,
                picked: p.id === currentProvider
            })),
            {placeHolder: 'Choose a default provider'}
        );

        if (!pick) return;

        await vscode.workspace
            .getConfiguration('gpthelper')
            .update('provider', pick.value, vscode.ConfigurationTarget.Global);

        const hasKey = Boolean(await runtime.llmRouter.getApiKey(pick.value));
        if (!hasKey) {
            const ok = await promptSetApiKeyForProvider(runtime, pick.value, {reason: 'missing'});
            if (!ok) return;
        }

        const next = await vscode.window.showQuickPick(
            [
                {label: 'Done', value: 'done', description: 'Use defaults for model and settings'},
                {label: 'Select model…', value: 'model', description: 'Pick a model for the active provider'}
            ],
            {placeHolder: 'Setup complete. Optional: choose a model now?'}
        );
        if (!next) return;

        if (next.value === 'model') {
            await vscode.commands.executeCommand('gpthelper.changeModel');
        }

        vscode.window.showInformationMessage('GPT setup complete. Highlight text and run “Ask GPT” (Alt+Shift+I).');
    };
}

module.exports = {createSetupHandler};