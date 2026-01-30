const vscode = require('vscode');

function createToggleDebugHandler(runtime) {
    return async function toggleDebugHandler() {
        runtime.state.debugMode = !runtime.state.debugMode;
        vscode.window.showInformationMessage(`Debug mode is now ${runtime.state.debugMode ? "On" : "Off"}.`);
        if (runtime.state.debugMode) runtime.state.outputChannel.show(true);
        runtime.logDebug('Debug mode toggled', {debugMode: runtime.state.debugMode});
    };
}

module.exports = {createToggleDebugHandler};