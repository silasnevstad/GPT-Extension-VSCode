const vscode = require('vscode');
const {EDITOR_ACTIONS} = require('../services/editorActionTemplates');
const {createRunAskFlow} = require('./runAskFlow');

function createEditorActionHandler(runtime, actionKey) {
    const action = EDITOR_ACTIONS[actionKey];
    const runAskFlow = createRunAskFlow(runtime);

    return async function editorActionHandler() {
        if (!action) {
            vscode.window.showErrorMessage('Unknown editor action.');
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found.');
            return;
        }

        if (editor.selection.isEmpty) {
            vscode.window.showWarningMessage('No text selected or file is empty.');
            return;
        }

        const queryText = editor.document.getText(editor.selection);

        await runAskFlow({
            editor,
            queryText,
            useWholeFile: false,
            systemActionTemplate: action.actionTemplate,
            progressTitle: action.progressTitle,
            commandId: action.commandId
        });
    };
}

module.exports = {createEditorActionHandler};