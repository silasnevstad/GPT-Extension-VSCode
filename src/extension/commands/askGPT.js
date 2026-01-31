const vscode = require('vscode');
const {createRunAskFlow} = require('./runAskFlow');

function createAskGptHandler(runtime) {
    const runAskFlow = createRunAskFlow(runtime);

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

        await runAskFlow({
            editor,
            queryText,
            useWholeFile,
            systemActionTemplate: null,
            progressTitle: 'Asking GPT...',
            commandId: useWholeFile ? 'gpthelper.askGPTFile' : 'gpthelper.askGPT'
        });
    };
}

module.exports = {createAskGptHandler};