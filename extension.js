const vscode = require('vscode');
const {ProjectInstructionManager} = require('./projectInstructionManager');
const {LLMRouter} = require('./src/llm/router');
const {toUserMessage, sanitizeForDebug, isCancellationError, isLLMError, LLMError} = require('./src/llm/errors');
const {staticModels, buildPickerItems, getKnownMaxOutputTokens} = require('./src/llm/modelRegistry');
const {getModels} = require('./src/llm/modelDiscovery');

let extensionContext = null;
// --- Global State Variables ---
let outputReplace = false;      // If true, replace text selection; if false, open new doc
let debugMode = false;
let llmRouter = null;

// Conversation context settings
let contextMode = 'none';    // 'none' | 'lastN' | 'full'
let contextLength = 3;      // Used if contextMode === 'lastN'

let temperature = null;   // If not set, API uses default
let topP = null;          // If not set, API uses default

// Debug logger (initialized in activate)
let outputChannel;

// In-memory chat history
let chatHistory = [];

// Project instruction manager
let instructionManager = null;

// SecretStorage warning (shown once per session)
let secretStorageWarned = false;

function safeErrorDetails(err) {
    return {
        name: typeof err?.name === 'string' ? err.name : 'Error',
        code: typeof err?.code === 'string' ? err.code : undefined
    };
}

function warnSecretStorageOnce() {
    if (secretStorageWarned) return;
    secretStorageWarned = true;
    vscode.window.showWarningMessage(
        'Unable to access VS Code Secret Storage. API keys cannot be loaded or saved.'
    );
}

/**
 * Prompt for a provider API key and store it via router (SecretStorage when available).
 * @param {'openai'|'anthropic'|'gemini'} providerId
 * @param {{ reason?: 'missing'|'invalid'|'manual' }} [opts]
 * @returns {Promise<boolean>}
 */
async function promptSetApiKeyForProvider(providerId, opts = {}) {
    if (!llmRouter) {
        vscode.window.showErrorMessage('GPT extension is not initialized yet.');
        return false;
    }

    const providerLabel = llmRouter.getProviderDisplayName(providerId);
    const existing = await llmRouter.getApiKey(providerId);

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
        const {persisted} = await llmRouter.setApiKey(providerId, newKey.trim());
        vscode.window.showInformationMessage(
            persisted
                ? `${providerLabel} API key saved.`
                : `${providerLabel} API key set for this session only (Secret Storage unavailable).`
        );
        return true;
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to save ${providerLabel} API key.`);
        logDebug('Set API key failed', safeErrorDetails(err));
        return false;
    }
}

async function setupHandler() {
    if (!llmRouter) {
        vscode.window.showErrorMessage('GPT extension is not initialized yet.');
        return;
    }

    const currentProvider = llmRouter.getActiveProviderId();

    const pick = await vscode.window.showQuickPick(
        [
            {label: 'OpenAI (recommended)', value: 'openai', description: 'Simplest setup; default provider'},
            {label: 'Anthropic', value: 'anthropic', description: 'Claude models'},
            {label: 'Gemini', value: 'gemini', description: 'Google Gemini models'}
        ].map(p => ({
            label: p.value === currentProvider ? `$(check) ${p.label}` : p.label,
            description: p.description,
            value: p.value,
            picked: p.value === currentProvider
        })),
        {placeHolder: 'Choose a default provider'}
    );

    if (!pick) return;

    await vscode.workspace
        .getConfiguration('gpthelper')
        .update('provider', pick.value, vscode.ConfigurationTarget.Global);

    const hasKey = Boolean(await llmRouter.getApiKey(pick.value));
    if (!hasKey) {
        const ok = await promptSetApiKeyForProvider(pick.value, {reason: 'missing'});
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
}

async function manageApiKeysHandler() {
    if (!llmRouter) {
        vscode.window.showErrorMessage('GPT extension is not initialized yet.');
        return;
    }

    const providers = [
        {id: 'openai', label: 'OpenAI'},
        {id: 'anthropic', label: 'Anthropic'},
        {id: 'gemini', label: 'Gemini'}
    ];

    const items = [];
    for (const p of providers) {
        const key = await llmRouter.getApiKey(p.id);
        items.push({
            label: p.label,
            description: key ? 'Configured' : 'Not set',
            providerId: p.id
        });
    }

    const pickedProvider = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a provider to manage its API key'
    });

    if (!pickedProvider) return;

    const providerId = pickedProvider.providerId;
    const providerLabel = pickedProvider.label;
    const hasKey = Boolean(await llmRouter.getApiKey(providerId));

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
            const {persisted} = await llmRouter.setApiKey(providerId, newKey.trim());
            vscode.window.showInformationMessage(
                persisted
                    ? `${providerLabel} API key updated.`
                    : `${providerLabel} API key set for this session only (Secret Storage unavailable).`
            );
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to update ${providerLabel} API key.`);
            logDebug('Manage API keys: set failed', safeErrorDetails(err));
        }
        return;
    }

    if (action.value === 'remove') {
        try {
            const {persisted} = await llmRouter.removeApiKey(providerId);
            vscode.window.showInformationMessage(
                persisted
                    ? `${providerLabel} API key removed.`
                    : `${providerLabel} API key removed for this session only (Secret Storage unavailable).`
            );
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to remove ${providerLabel} API key.`);
            logDebug('Manage API keys: remove failed', safeErrorDetails(err));
        }
    }
}


// Debug logger
function logDebug(message, details = {}) {
    if (!debugMode || !outputChannel) return;
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`[${timestamp}] ${message}`);
    if (details && Object.keys(details).length > 0) {
        // Never log secrets or prompt contents
        outputChannel.appendLine(JSON.stringify(sanitizeForDebug(details), null, 2));
    }
    outputChannel.appendLine('---');
}

// Format chat history as Markdown
function formatChatHistory() {
    const providerLabel = (p) => (p === 'anthropic' ? 'Anthropic' : p === 'gemini' ? 'Gemini' : 'OpenAI');
    return chatHistory
        .map(msg => {
            const timeStr = new Date(msg.timestamp).toLocaleTimeString();
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            const provider = providerLabel(typeof msg.provider === 'string' ? msg.provider : 'openai');
            const model = typeof msg.model === 'string' ? msg.model : 'unknown-model';
            return `${'='.repeat(10)}\n**${role} (${provider}/${model}) [${timeStr}]:**\n${msg.content}\n${'='.repeat(10)}\n`;
        })
        .join('\n');
}

// Ask GPT command (with selection or entire file)
async function askGPTHandler(useWholeFile = false) {
    if (!llmRouter) {
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
    const preProvider = llmRouter.getActiveProviderId();
    const preLabel = llmRouter.getProviderDisplayName(preProvider);
    const preKey = await llmRouter.getApiKey(preProvider);

    if (!preKey) {
        const action = await vscode.window.showWarningMessage(
            `${preLabel} API key is not configured.`,
            'Set API Key',
            'Run Setup',
            'Cancel'
        );

        if (action === 'Set API Key') {
            const ok = await promptSetApiKeyForProvider(preProvider, {reason: 'missing'});
            if (!ok) return;
        } else if (action === 'Run Setup') {
            await vscode.commands.executeCommand('gpthelper.setup');
            const postProvider = llmRouter.getActiveProviderId();
            const postKey = await llmRouter.getApiKey(postProvider);
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

            const instruction = instructionManager
                ? await instructionManager.getInstruction(editor.document)
                : '';

            if (token.isCancellationRequested) return;

            const sendArgs = {
                userPrompt: queryText,
                system: instruction,
                history: chatHistory,
                contextMode,
                contextLength,
                temperature,
                topP,
                signal: abortController.signal,
                debug: debugMode
            };

            let result;
            let attemptedAuthRecovery = false;

            try {
                result = await llmRouter.send(sendArgs);
            } catch (err) {
                let effectiveErr = err;

                // cancellation: keep current behavior
                if (token.isCancellationRequested || abortController.signal.aborted || isCancellationError(err)) {
                    logDebug('LLM request canceled');
                    return;
                }

                // Self-heal Auth once
                if (!attemptedAuthRecovery && isLLMError(err) && err.kind === 'Auth') {
                    attemptedAuthRecovery = true;

                    const providerId = typeof err.provider === 'string'
                        ? err.provider
                        : llmRouter.getActiveProviderId();

                    const providerLabel = llmRouter.getProviderDisplayName(providerId);

                    const action = await vscode.window.showWarningMessage(
                        `${providerLabel} API key is missing or invalid.`,
                        'Update API Key',
                        'Run Setup',
                        'Cancel'
                    );

                    if (action === 'Update API Key') {
                        const ok = await promptSetApiKeyForProvider(providerId, { reason: 'invalid' });
                        if (!ok) return;
                    } else if (action === 'Run Setup') {
                        await vscode.commands.executeCommand('gpthelper.setup');
                        const postProvider = llmRouter.getActiveProviderId();
                        const postKey = await llmRouter.getApiKey(postProvider);
                        if (!postKey) return;
                    } else {
                        return;
                    }

                    if (token.isCancellationRequested || abortController.signal.aborted) return;

                    // retry exactly once
                    try {
                        result = await llmRouter.send(sendArgs);
                    } catch (retryErr) {
                        effectiveErr = retryErr;
                    }
                }

                if (!result) {
                    const providerId = isLLMError(effectiveErr) && typeof effectiveErr.provider === 'string'
                        ? effectiveErr.provider
                        : llmRouter.getActiveProviderId();

                    const model = llmRouter.getModel(providerId);

                    const msg = toUserMessage(
                        isLLMError(effectiveErr)
                            ? effectiveErr
                            : new LLMError({
                                kind: 'Unknown',
                                provider: providerId,
                                message: 'Unknown error.'
                            }),
                        {
                            providerLabel: llmRouter.getProviderDisplayName(providerId),
                            model,
                            commandHints: {
                                setKey: 'GPT: Set API Key',
                                changeModel: 'GPT: Change Model'
                            }
                        }
                    );

                    if (isLLMError(effectiveErr) && effectiveErr.kind === 'NotFoundModel') {
                        const providerLabel = llmRouter.getProviderDisplayName(providerId);
                        const apiKey = await llmRouter.getApiKey(providerId);
                        if (apiKey && extensionContext) {
                            getModels({ providerId, context: extensionContext, apiKey, force: true }).catch(() => {});
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

                    logDebug('LLM request failed', {
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
            logDebug('GPT response time', {durationMs: duration});

            // If the user canceled after the request completed, do nothing.
            if (token.isCancellationRequested || abortController.signal.aborted) return;

            if (result?.text) {
                // Save to chat history
                const now = Date.now();
                chatHistory.push({
                    role: 'user',
                    content: queryText,
                    provider: result.provider,
                    model: result.model,
                    timestamp: now
                });
                chatHistory.push({
                    role: 'assistant',
                    content: result.text,
                    provider: result.provider,
                    model: result.model,
                    timestamp: now
                });

                if (outputReplace && !useWholeFile) {
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
}

// Export chat history as Markdown
async function exportChatHistory() {
    if (!chatHistory.length) {
        vscode.window.showInformationMessage('No chat history to export.');
        return;
    }

    const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;

    const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {'Markdown': ['md']},
        saveLabel: 'Export Chat History'
    });
    if (!uri) return;

    const mdContent = formatChatHistory();

    try {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(mdContent, 'utf8'));
        vscode.window.showInformationMessage('Chat history exported successfully!');
    } catch (err) {
        vscode.window.showErrorMessage('Error exporting chat history.');
        logDebug('Export chat history failed', safeErrorDetails(err));
    }
}

// Change context mode (none, lastN, full)
async function changeContextMode() {
    const pick = await vscode.window.showQuickPick([
        {label: 'No Context', value: 'none'},
        {label: 'Last N Messages', value: 'lastN'},
        {label: 'Full', value: 'full'}
    ], {placeHolder: 'Select a conversation context mode'});

    if (!pick) return;
    contextMode = pick.value;

    vscode.window.showInformationMessage(`Context mode set to: ${pick.label}`);
    logDebug('Context mode changed', {contextMode});
}

// Set how many messages are used if in 'lastN' mode
async function setContextLength() {
    const val = await vscode.window.showInputBox({
        prompt: `Number of messages to include (current: ${contextLength})`
    });
    if (!val) return;

    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 1) {
        vscode.window.showWarningMessage('Please enter a positive integer.');
        return;
    }
    contextLength = parsed;
    vscode.window.showInformationMessage(`Context length set to ${contextLength}`);
    logDebug('Context length changed', {contextLength});
}

// --- Activation & Deactivation ---
async function activate(context) {
    outputChannel = vscode.window.createOutputChannel("GPT Debug");
    context.subscriptions.push(outputChannel);

    extensionContext = context;

    llmRouter = new LLMRouter({
        vscode,
        context,
        logDebug,
        warnSecretStorageOnce,
        warnUser: (msg) => vscode.window.showWarningMessage(msg)
    });

    // Initialize .gpt-instruction manager (multi-root aware)
    instructionManager = new ProjectInstructionManager({
        logDebug,
        warnUser: (msg) => vscode.window.showWarningMessage(msg)
    });
    instructionManager.initialize();
    context.subscriptions.push(instructionManager);

    // Register commands
    const commands = [
        // Ask GPT (selection)
        vscode.commands.registerCommand('gpthelper.askGPT', () => askGPTHandler(false)),

        // Ask GPT (entire file)
        vscode.commands.registerCommand('gpthelper.askGPTFile', () => askGPTHandler(true)),

        // Setup / onboarding
        vscode.commands.registerCommand('gpthelper.setup', setupHandler),

        // Export conversation
        vscode.commands.registerCommand('gpthelper.exportChatHistory', exportChatHistory),

        // Debug mode toggle
        vscode.commands.registerCommand('gpthelper.changeDebugMode', () => {
            debugMode = !debugMode;
            vscode.window.showInformationMessage(`Debug mode is now ${debugMode ? "On" : "Off"}.`);
            if (debugMode) outputChannel.show(true);
            logDebug('Debug mode toggled', {debugMode});
        }),

        // Output mode toggle
        vscode.commands.registerCommand('gpthelper.changeOutputMode', () => {
            outputReplace = !outputReplace;
            vscode.window.showInformationMessage(`Output mode: ${outputReplace ? "Replace Selection" : "New File"}.`);
            logDebug('Output mode toggled', {outputReplace});
        }),

        // Change provider
        vscode.commands.registerCommand('gpthelper.changeProvider', async () => {
            const currentProvider = llmRouter.getActiveProviderId();

            const items = [
                {label: 'OpenAI', value: 'openai'},
                {label: 'Anthropic', value: 'anthropic'},
                {label: 'Gemini', value: 'gemini'}
            ].map(p => ({
                label: p.value === currentProvider ? `$(check) ${p.label}` : p.label,
                value: p.value,
                picked: p.value === currentProvider
            }));

            const pick = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select an LLM provider'
            });

            if (!pick) return;

            await vscode.workspace
                .getConfiguration('gpthelper')
                .update('provider', pick.value, vscode.ConfigurationTarget.Global);

            const key = await llmRouter.getApiKey(pick.value);
            if (!key) {
                const action = await vscode.window.showWarningMessage(
                    `${pick.label.replace('$(check) ', '')} is selected but no API key is configured. Set one now?`,
                    'Set API Key',
                    'Cancel'
                );
                if (action === 'Set API Key') {
                    await promptSetApiKeyForProvider(pick.value, { reason: 'missing' });
                }
            }

            vscode.window.showInformationMessage(
                `Provider set to: ${pick.label.replace('$(check) ', '')}`
            );
            logDebug('Provider changed', {provider: pick.value});
        }),

        // Change model
        vscode.commands.registerCommand('gpthelper.changeModel', async () => {
            const providerId = llmRouter.getActiveProviderId();
            const providerLabel = llmRouter.getProviderDisplayName(providerId);

            const apiKey = await llmRouter.getApiKey(providerId);
            let entry = await getModels({
                providerId,
                context,
                apiKey,
                staticFallback: staticModels(providerId)
            });

            const models = (entry?.items?.length ? entry.items : staticModels(providerId))
                .map(m => ({label: m.label, id: m.id, detail: m.detail}));

            const currentModel = llmRouter.getModel(providerId);

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
                        context,
                        apiKey,
                        force: true,
                        signal: controller.signal,
                        staticFallback: staticModels(providerId)
                    });
                });
                return vscode.commands.executeCommand('gpthelper.changeModel');
            }
            if (modelId === '__custom__') {
                const current = llmRouter.getModel(providerId);
                const custom = await vscode.window.showInputBox({
                    prompt: `Enter custom ${providerLabel} model id`,
                    value: current
                });
                if (!custom || !custom.trim()) return;
                modelId = custom.trim();
            }

            await llmRouter.setModel(providerId, modelId);
            vscode.window.showInformationMessage(`Model changed to ${modelId} (${providerLabel}).`);
            logDebug('Model changed', {provider: providerId, model: modelId});
        }),

        // Change temperature
        vscode.commands.registerCommand('gpthelper.changeTemperature', async () => {
            const providerId = llmRouter.getActiveProviderId();

            const current = (typeof temperature === 'number') ? temperature : null;

            const action = await vscode.window.showQuickPick(
                [
                    {label: `Set temperature…${current === null ? '' : ` (current: ${current})`}`, value: 'set'},
                    {label: 'Use provider default (unset)', value: 'unset'}
                ],
                {placeHolder: 'Temperature setting'}
            );
            if (!action) return;

            if (action.value === 'unset') {
                temperature = null;
                vscode.window.showInformationMessage('Temperature unset (provider default).');
                logDebug('Temperature changed', {temperature: null});
                return;
            }

            const raw = await vscode.window.showInputBox({
                prompt: 'Enter temperature (0.0 - 1.0)',
                value: current === null ? undefined : String(current)
            });
            if (!raw) return;

            const val = parseFloat(raw);
            if (!Number.isFinite(val) || val < 0 || val > 1) {
                vscode.window.showErrorMessage('Temperature must be between 0.0 and 1.0.');
                return;
            }

            // Anthropic constraint UX
            if (providerId === 'anthropic' && typeof topP === 'number') {
                const choice = await vscode.window.showWarningMessage(
                    'Anthropic does not support using both temperature and top-p. Setting temperature will unset top-p.',
                    'Proceed',
                    'Cancel'
                );
                if (choice !== 'Proceed') return;
                topP = null;
            }

            temperature = val;
            vscode.window.showInformationMessage(`Temperature set to ${val}.`);
            logDebug('Temperature changed', {temperature: val});
        }),

        // Change top_p
        vscode.commands.registerCommand('gpthelper.changeTopP', async () => {
            const providerId = llmRouter.getActiveProviderId();

            const current = (typeof topP === 'number') ? topP : null;

            const action = await vscode.window.showQuickPick(
                [
                    {label: `Set top_p…${current === null ? '' : ` (current: ${current})`}`, value: 'set'},
                    {label: 'Use provider default (unset)', value: 'unset'}
                ],
                {placeHolder: 'Top_p setting'}
            );
            if (!action) return;

            if (action.value === 'unset') {
                topP = null;
                vscode.window.showInformationMessage('top_p unset (provider default).');
                logDebug('top_p changed', {topP: null});
                return;
            }

            const raw = await vscode.window.showInputBox({
                prompt: 'Enter top_p (0.0 - 1.0)',
                value: current === null ? undefined : String(current)
            });
            if (!raw) return;

            const val = parseFloat(raw);
            if (!Number.isFinite(val) || val < 0 || val > 1) {
                vscode.window.showErrorMessage('top_p must be between 0.0 and 1.0.');
                return;
            }

            // Anthropic constraint UX
            if (providerId === 'anthropic' && typeof temperature === 'number') {
                const choice = await vscode.window.showWarningMessage(
                    'Anthropic does not support using both temperature and top-p. Setting top-p will unset temperature.',
                    'Proceed',
                    'Cancel'
                );
                if (choice !== 'Proceed') return;
                temperature = null;
            }

            topP = val;
            vscode.window.showInformationMessage(`top_p set to ${val}.`);
            logDebug('top_p changed', {topP: val});
        }),

        // Unified API key manager
        vscode.commands.registerCommand('gpthelper.manageApiKeys', manageApiKeysHandler),

        // GPT: Set API Key (alias, visible in UX)
        vscode.commands.registerCommand('gpthelper.setKey', async () => {
            if (!llmRouter) {
                vscode.window.showErrorMessage('GPT extension is not initialized yet.');
                return;
            }
            const providerId = llmRouter.getActiveProviderId();
            await promptSetApiKeyForProvider(providerId, {reason: 'manual'});
        }),

        // Change max output tokens (0 => default/max)
        vscode.commands.registerCommand('gpthelper.changeLimit', async () => {
            const providerId = llmRouter.getActiveProviderId();
            const model = llmRouter.getModel(providerId);
            const knownMax = getKnownMaxOutputTokens(providerId, model);
            const current = llmRouter.getMaxOutputTokensSetting(providerId);

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
            await llmRouter.setMaxOutputTokens(val);
            vscode.window.showInformationMessage(`Max output tokens set to ${val === 0 ? 'default/max' : val}.`);
            logDebug('Max output tokens changed', {maxOutputTokens: val});
        }),

        // Context Mode
        vscode.commands.registerCommand('gpthelper.changeContextMode', changeContextMode),

        // Context Length
        vscode.commands.registerCommand('gpthelper.setContextLength', setContextLength),

        // Show chat history
        vscode.commands.registerCommand('gpthelper.showChatHistory', async () => {
            if (!chatHistory.length) {
                vscode.window.showInformationMessage('No chat history available.');
                return;
            }
            const doc = await vscode.workspace.openTextDocument({
                content: formatChatHistory(),
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            logDebug('Displayed chat history', {length: chatHistory.length});
        }),

        // Clear chat history
        vscode.commands.registerCommand('gpthelper.clearChatHistory', () => {
            chatHistory = [];
            vscode.window.showInformationMessage('Chat history cleared.');
            logDebug('Chat history cleared');
        })
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
}

function deactivate() {
}

module.exports = {activate, deactivate};
