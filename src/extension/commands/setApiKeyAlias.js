const vscode = require('vscode');
const {promptSetApiKeyForProvider} = require('../services/apiKeyUi');

function createSetKeyAliasHandler(runtime) {
    return async function setKeyAliasHandler() {
        if (!runtime?.llmRouter) {
            vscode.window.showErrorMessage('GPT extension is not initialized yet.');
            return;
        }
        const providerId = runtime.llmRouter.getActiveProviderId();
        await promptSetApiKeyForProvider(runtime, providerId, {reason: 'manual'});
    };
}

module.exports = {createSetKeyAliasHandler};