const vscode = require('vscode');
const {getKnownMaxOutputTokens} = require('../../llm/modelRegistry');

function createChangeTokenLimitHandler(runtime) {
    return async function changeTokenLimitHandler() {
        const providerId = runtime.llmRouter.getActiveProviderId();
        const model = runtime.llmRouter.getModel(providerId);
        const knownMax = getKnownMaxOutputTokens(providerId, model);
        const current = runtime.llmRouter.getMaxOutputTokensSetting(providerId);

        const limitPrompt = await vscode.window.showInputBox({
            prompt: knownMax
                ? `Enter max output tokens (0 = default/max). Current: ${current}. Known max for ${model}: ${knownMax}`
                : `Enter max output tokens (0 = default). Current: ${current}`,
            value: String(current)
        });
        if (!limitPrompt) return;
        const val = parseInt(limitPrompt, 10);
        if (isNaN(val) || val < 0) {
            vscode.window.showErrorMessage('Max output tokens must be a non-negative integer (0 = default/max).');
            return;
        }
        await runtime.llmRouter.setMaxOutputTokens(val);
        vscode.window.showInformationMessage(`Max output tokens set to ${val === 0 ? 'default/max' : val}.`);
        runtime.logDebug('Max output tokens changed', {maxOutputTokens: val});
    };
}

module.exports = {createChangeTokenLimitHandler};