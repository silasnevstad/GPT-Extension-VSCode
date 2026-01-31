const vscode = require('vscode');
const {createAskGptHandler} = require('./askGPT');
const {createEditorActionHandler} = require('./editorActions');
const {createSetupHandler} = require('./setup');
const {createManageApiKeysHandler} = require('./manageApiKeys');
const {createSetKeyAliasHandler} = require('./setApiKeyAlias');
const {createChangeProviderHandler} = require('./changeProvider');
const {createChangeModelHandler} = require('./changeModel');
const {createChangeTokenLimitHandler} = require('./changeTokenLimit');
const {createChangeTemperatureHandler, createChangeTopPHandler} = require('./changeSampling');
const {createChangeContextModeHandler, createSetContextLengthHandler} = require('./changeContext');
const {
    createShowChatHistoryHandler,
    createExportChatHistoryHandler,
    createClearChatHistoryHandler
} = require('./chatHistoryCommands');
const {createToggleDebugHandler} = require('./toggleDebug');
const {createToggleOutputModeHandler} = require('./toggleOutputMode');

function registerCommands(runtime, context) {
    const askGptHandler = createAskGptHandler(runtime);
    const setupHandler = createSetupHandler(runtime);
    const manageApiKeysHandler = createManageApiKeysHandler(runtime);
    const setKeyAliasHandler = createSetKeyAliasHandler(runtime);
    const changeProviderHandler = createChangeProviderHandler(runtime);
    const changeModelHandler = createChangeModelHandler(runtime);
    const changeTokenLimitHandler = createChangeTokenLimitHandler(runtime);
    const changeTemperatureHandler = createChangeTemperatureHandler(runtime);
    const changeTopPHandler = createChangeTopPHandler(runtime);
    const changeContextModeHandler = createChangeContextModeHandler(runtime);
    const setContextLengthHandler = createSetContextLengthHandler(runtime);
    const showChatHistoryHandler = createShowChatHistoryHandler(runtime);
    const exportChatHistoryHandler = createExportChatHistoryHandler(runtime);
    const clearChatHistoryHandler = createClearChatHistoryHandler(runtime);
    const toggleDebugHandler = createToggleDebugHandler(runtime);
    const toggleOutputModeHandler = createToggleOutputModeHandler(runtime);
    const explainSelectionHandler = createEditorActionHandler(runtime, 'explainSelection');
    const refactorSelectionHandler = createEditorActionHandler(runtime, 'refactorSelection');
    const fixSelectionHandler = createEditorActionHandler(runtime, 'fixSelection');
    const addDocCommentsHandler = createEditorActionHandler(runtime, 'addDocComments');

    const commands = [
        // Ask GPT (selection)
        vscode.commands.registerCommand('gpthelper.askGPT', () => askGptHandler(false)),

        // Ask GPT (entire file)
        vscode.commands.registerCommand('gpthelper.askGPTFile', () => askGptHandler(true)),

        // Editor actions (selection)
        vscode.commands.registerCommand('gpthelper.explainSelection', explainSelectionHandler),
        vscode.commands.registerCommand('gpthelper.refactorSelection', refactorSelectionHandler),
        vscode.commands.registerCommand('gpthelper.fixSelection', fixSelectionHandler),
        vscode.commands.registerCommand('gpthelper.addDocComments', addDocCommentsHandler),

        // Setup / onboarding
        vscode.commands.registerCommand('gpthelper.setup', setupHandler),

        // Export conversation
        vscode.commands.registerCommand('gpthelper.exportChatHistory', exportChatHistoryHandler),

        // Debug mode toggle
        vscode.commands.registerCommand('gpthelper.changeDebugMode', toggleDebugHandler),

        // Output mode toggle
        vscode.commands.registerCommand('gpthelper.changeOutputMode', toggleOutputModeHandler),

        // Change provider
        vscode.commands.registerCommand('gpthelper.changeProvider', changeProviderHandler),

        // Change model
        vscode.commands.registerCommand('gpthelper.changeModel', changeModelHandler),

        // Change temperature
        vscode.commands.registerCommand('gpthelper.changeTemperature', changeTemperatureHandler),

        // Change top_p
        vscode.commands.registerCommand('gpthelper.changeTopP', changeTopPHandler),

        // Unified API key manager
        vscode.commands.registerCommand('gpthelper.manageApiKeys', manageApiKeysHandler),

        // GPT: Set API Key (alias, visible in UX)
        vscode.commands.registerCommand('gpthelper.setKey', setKeyAliasHandler),

        // Change max output tokens (0 => default/max)
        vscode.commands.registerCommand('gpthelper.changeLimit', changeTokenLimitHandler),

        // Context Mode
        vscode.commands.registerCommand('gpthelper.changeContextMode', changeContextModeHandler),

        // Context Length
        vscode.commands.registerCommand('gpthelper.setContextLength', setContextLengthHandler),

        // Show chat history
        vscode.commands.registerCommand('gpthelper.showChatHistory', showChatHistoryHandler),

        // Clear chat history
        vscode.commands.registerCommand('gpthelper.clearChatHistory', clearChatHistoryHandler)
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
}

module.exports = {registerCommands};