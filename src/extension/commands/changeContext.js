const vscode = require('vscode');

function createChangeContextModeHandler(runtime) {
    return async function changeContextModeHandler() {
        const pick = await vscode.window.showQuickPick([
            {label: 'No Context', value: 'none'},
            {label: 'Last N Messages', value: 'lastN'},
            {label: 'Full', value: 'full'}
        ], {placeHolder: 'Select a conversation context mode'});

        if (!pick) return;
        runtime.state.contextMode = pick.value;

        vscode.window.showInformationMessage(`Context mode set to: ${pick.label}`);
        runtime.logDebug('Context mode changed', {contextMode: runtime.state.contextMode});
    };
}

function createSetContextLengthHandler(runtime) {
    return async function setContextLengthHandler() {
        const val = await vscode.window.showInputBox({
            prompt: `Number of messages to include (current: ${runtime.state.contextLength})`
        });
        if (!val) return;

        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed < 1) {
            vscode.window.showWarningMessage('Please enter a positive integer.');
            return;
        }
        runtime.state.contextLength = parsed;
        vscode.window.showInformationMessage(`Context length set to ${runtime.state.contextLength}`);
        runtime.logDebug('Context length changed', {contextLength: runtime.state.contextLength});
    };
}

module.exports = {createChangeContextModeHandler, createSetContextLengthHandler};