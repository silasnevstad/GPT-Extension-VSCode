const vscode = require('vscode');
const {toUserMessage, isCancellationError, isLLMError, LLMError} = require('../../llm/errors');
const {getModels} = require('../../llm/modelDiscovery');
const {promptSetApiKeyForProvider} = require('../services/apiKeyUi');

function createAskGptHandler(runtime) {
    return async function askGptHandler(useWholeFile = false) {
        if (!runtime?.llmRouter) {
            vscode.window.showErrorMessage('GPT extension is not initialized yet.');
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found.');
            return;
        }

        const queryText = useWholeFile
            ? editor.document.getText()
            : editor.document.getText(editor.selection);

        if (!queryText.trim()) {
            vscode.window.showWarningMessage('No text selected or file is empty.');
            return;
        }

        // If key is missing, onboard before showing progress UI.
        const preProvider = runtime.llmRouter.getActiveProviderId();
        const preLabel = runtime.llmRouter.getProviderDisplayName(preProvider);
        const preKey = await runtime.llmRouter.getApiKey(preProvider);

        if (!preKey) {
            const action = await vscode.window.showWarningMessage(
                `${preLabel} API key is not configured.`,
                'Set API Key',
                'Run Setup',
                'Cancel'
            );

            if (action === 'Set API Key') {
                const ok = await promptSetApiKeyForProvider(runtime, preProvider, {reason: 'missing'});
                if (!ok) return;
            } else if (action === 'Run Setup') {
                await vscode.commands.executeCommand('gpthelper.setup');
                const postProvider = runtime.llmRouter.getActiveProviderId();
                const postKey = await runtime.llmRouter.getApiKey(postProvider);
                if (!postKey) return;
            } else {
                return;
            }
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Asking GPT...',
            cancellable: true
        }, async (_progress, token) => {
            const abortController = new AbortController();
            const cancelSub = token.onCancellationRequested(() => abortController.abort());

            try {
                const startTime = Date.now();

                const instruction = runtime.instructionManager
                    ? await runtime.instructionManager.getInstruction(editor.document)
                    : '';

                if (token.isCancellationRequested) return;

                const sendArgs = {
                    userPrompt: queryText,
                    system: instruction,
                    history: runtime.state.chatHistory,
                    contextMode: runtime.state.contextMode,
                    contextLength: runtime.state.contextLength,
                    temperature: runtime.state.temperature,
                    topP: runtime.state.topP,
                    signal: abortController.signal,
                    debug: runtime.state.debugMode
                };

                let result;
                let attemptedAuthRecovery = false;

                try {
                    result = await runtime.llmRouter.send(sendArgs);
                } catch (err) {
                    let effectiveErr = err;

                    // cancellation: keep current behavior
                    if (token.isCancellationRequested || abortController.signal.aborted || isCancellationError(err)) {
                        runtime.logDebug('LLM request canceled');
                        return;
                    }

                    // Self-heal Auth once
                    if (!attemptedAuthRecovery && isLLMError(err) && err.kind === 'Auth') {
                        attemptedAuthRecovery = true;

                        const providerId = typeof err.provider === 'string'
                            ? err.provider
                            : runtime.llmRouter.getActiveProviderId();

                        const providerLabel = runtime.llmRouter.getProviderDisplayName(providerId);

                        const action = await vscode.window.showWarningMessage(
                            `${providerLabel} API key is missing or invalid.`,
                            'Update API Key',
                            'Run Setup',
                            'Cancel'
                        );

                        if (action === 'Update API Key') {
                            const ok = await promptSetApiKeyForProvider(runtime, providerId, { reason: 'invalid' });
                            if (!ok) return;
                        } else if (action === 'Run Setup') {
                            await vscode.commands.executeCommand('gpthelper.setup');
                            const postProvider = runtime.llmRouter.getActiveProviderId();
                            const postKey = await runtime.llmRouter.getApiKey(postProvider);
                            if (!postKey) return;
                        } else {
                            return;
                        }

                        if (token.isCancellationRequested || abortController.signal.aborted) return;

                        // retry exactly once
                        try {
                            result = await runtime.llmRouter.send(sendArgs);
                        } catch (retryErr) {
                            effectiveErr = retryErr;
                        }
                    }

                    if (!result) {
                        const providerId = isLLMError(effectiveErr) && typeof effectiveErr.provider === 'string'
                            ? effectiveErr.provider
                            : runtime.llmRouter.getActiveProviderId();

                        const model = runtime.llmRouter.getModel(providerId);

                        const msg = toUserMessage(
                            isLLMError(effectiveErr)
                                ? effectiveErr
                                : new LLMError({
                                    kind: 'Unknown',
                                    provider: providerId,
                                    message: 'Unknown error.'
                                }),
                            {
                                providerLabel: runtime.llmRouter.getProviderDisplayName(providerId),
                                model,
                                commandHints: {
                                    setKey: 'GPT: Set API Key',
                                    changeModel: 'GPT: Change Model'
                                }
                            }
                        );

                        if (isLLMError(effectiveErr) && effectiveErr.kind === 'NotFoundModel') {
                            const providerLabel = runtime.llmRouter.getProviderDisplayName(providerId);
                            const apiKey = await runtime.llmRouter.getApiKey(providerId);
                            if (apiKey && runtime.state.extensionContext) {
                                getModels({ providerId, context: runtime.state.extensionContext, apiKey, force: true }).catch(() => {});
                            }
                            const action = await vscode.window.showWarningMessage(
                                `Model not available for ${providerLabel} (${model}).`,
                                'Open GPT: Change Model',
                                'Cancel'
                            );
                            if (action === 'Open GPT: Change Model') {
                                vscode.commands.executeCommand('gpthelper.changeModel');
                            }
                            return;
                        } else if (isLLMError(effectiveErr) && effectiveErr.kind === 'RateLimit') {
                            vscode.window.showWarningMessage(msg);
                        } else {
                            vscode.window.showErrorMessage(msg);
                        }

                        runtime.logDebug('LLM request failed', {
                            provider: providerId,
                            model,
                            kind: isLLMError(effectiveErr) ? effectiveErr.kind : 'Unknown',
                            status: isLLMError(effectiveErr) ? effectiveErr.status : undefined,
                            providerCode: isLLMError(effectiveErr) ? effectiveErr.providerCode : undefined,
                            requestId: isLLMError(effectiveErr) ? effectiveErr.requestId : undefined
                        });
                        return;
                    }
                }
                const duration = Date.now() - startTime;
                runtime.logDebug('GPT response time', {durationMs: duration});

                // If the user canceled after the request completed, do nothing.
                if (token.isCancellationRequested || abortController.signal.aborted) return;

                if (result?.text) {
                    // Save to chat history
                    const now = Date.now();
                    runtime.state.chatHistory.push({
                        role: 'user',
                        content: queryText,
                        provider: result.provider,
                        model: result.model,
                        timestamp: now
                    });
                    runtime.state.chatHistory.push({
                        role: 'assistant',
                        content: result.text,
                        provider: result.provider,
                        model: result.model,
                        timestamp: now
                    });

                    if (runtime.state.outputReplace && !useWholeFile) {
                        // Replace selected text
                        await editor.edit(editBuilder => {
                            editBuilder.replace(editor.selection, result.text);
                        });
                    } else {
                        // Open response in a new document
                        const doc = await vscode.workspace.openTextDocument({content: result.text});
                        await vscode.window.showTextDocument(doc);
                    }
                }
            } finally {
                cancelSub.dispose();
            }
        });
    };
}

module.exports = {createAskGptHandler};