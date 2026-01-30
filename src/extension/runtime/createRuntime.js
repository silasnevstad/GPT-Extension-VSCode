const {ProjectInstructionManager} = require('../../../projectInstructionManager');
const {LLMRouter} = require('../../llm/router');
const {createState} = require('./state');
const {createLogger} = require('./logger');

function createRuntime({vscode, context}) {
    const state = createState();
    state.extensionContext = context;
    state.outputChannel = vscode.window.createOutputChannel('GPT Debug');
    context.subscriptions.push(state.outputChannel);

    function warnSecretStorageOnce() {
        if (state.secretStorageWarned) return;
        state.secretStorageWarned = true;
        vscode.window.showWarningMessage(
            'Unable to access VS Code Secret Storage. API keys cannot be loaded or saved.'
        );
    }

    const {logDebug} = createLogger({state});

    state.llmRouter = new LLMRouter({
        vscode,
        context,
        logDebug,
        warnSecretStorageOnce,
        warnUser: (msg) => vscode.window.showWarningMessage(msg)
    });

    state.instructionManager = new ProjectInstructionManager({
        logDebug,
        warnUser: (msg) => vscode.window.showWarningMessage(msg)
    });
    state.instructionManager.initialize();
    context.subscriptions.push(state.instructionManager);

    return {
        state,
        logDebug,
        warnSecretStorageOnce,
        llmRouter: state.llmRouter,
        instructionManager: state.instructionManager
    };
}

module.exports = {createRuntime};