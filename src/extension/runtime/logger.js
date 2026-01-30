const {sanitizeForDebug} = require('../../llm/errors');

function createLogger({state}) {
    function logDebug(message, details = {}) {
        if (!state.debugMode || !state.outputChannel) return;
        const timestamp = new Date().toISOString();
        state.outputChannel.appendLine(`[${timestamp}] ${message}`);
        if (details && Object.keys(details).length > 0) {
            // Never log secrets or prompt contents
            state.outputChannel.appendLine(JSON.stringify(sanitizeForDebug(details), null, 2));
        }
        state.outputChannel.appendLine('---');
    }

    return {logDebug};
}

module.exports = {createLogger};