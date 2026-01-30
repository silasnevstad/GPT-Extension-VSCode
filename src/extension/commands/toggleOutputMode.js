const vscode = require('vscode');

function createToggleOutputModeHandler(runtime) {
    return async function toggleOutputModeHandler() {
        runtime.state.outputReplace = !runtime.state.outputReplace;
        vscode.window.showInformationMessage(`Output mode: ${runtime.state.outputReplace ? "Replace Selection" : "New File"}.`);
        runtime.logDebug('Output mode toggled', {outputReplace: runtime.state.outputReplace});
    };
}

module.exports = {createToggleOutputModeHandler};