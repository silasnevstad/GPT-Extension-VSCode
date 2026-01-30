const vscode = require('vscode');
const {staticModels, buildPickerItems} = require('../../llm/modelRegistry');
const {getModels} = require('../../llm/modelDiscovery');

function createChangeModelHandler(runtime) {
    return async function changeModelHandler() {
        const providerId = runtime.llmRouter.getActiveProviderId();
        const providerLabel = runtime.llmRouter.getProviderDisplayName(providerId);

        const apiKey = await runtime.llmRouter.getApiKey(providerId);
        let entry = await getModels({
            providerId,
            context: runtime.state.extensionContext,
            apiKey,
            staticFallback: staticModels(providerId)
        });

        const models = (entry?.items?.length ? entry.items : staticModels(providerId))
            .map(m => ({label: m.label, id: m.id, detail: m.detail}));

        const currentModel = runtime.llmRouter.getModel(providerId);

        const includeRefresh = Boolean(apiKey);
        const items = buildPickerItems(models, { includeRefresh }).map(m => {
            const isCurrent = m.id === currentModel;

            return {
                label: isCurrent ? `$(check) ${m.label}` : m.label,
                description:
                    m.id && !m.id.startsWith('__')
                        ? (isCurrent ? `${m.id} (current)` : m.id)
                        : '',
                detail: m.detail,
                picked: isCurrent,
                _modelId: m.id
            };
        });

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: `Select a model (${providerLabel})`
        });
        if (!pick) return;

        /** @type {string} */
        let modelId = pick._modelId;
        if (modelId === '__refresh__') {
            if (!apiKey) {
                vscode.window.showWarningMessage('Set an API key to refresh models online.');
                return;
            }
            const controller = new AbortController();
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Refreshing models…',
                cancellable: true
            }, async (_p, token) => {
                token.onCancellationRequested(() => controller.abort());
                await getModels({
                    providerId,
                    context: runtime.state.extensionContext,
                    apiKey,
                    force: true,
                    signal: controller.signal,
                    staticFallback: staticModels(providerId)
                });
            });
            return vscode.commands.executeCommand('gpthelper.changeModel');
        }
        if (modelId === '__custom__') {
            const current = runtime.llmRouter.getModel(providerId);
            const custom = await vscode.window.showInputBox({
                prompt: `Enter custom ${providerLabel} model id`,
                value: current
            });
            if (!custom || !custom.trim()) return;
            modelId = custom.trim();
        }

        await runtime.llmRouter.setModel(providerId, modelId);
        vscode.window.showInformationMessage(`Model changed to ${modelId} (${providerLabel}).`);
        runtime.logDebug('Model changed', {provider: providerId, model: modelId});
    };
}

module.exports = {createChangeModelHandler};