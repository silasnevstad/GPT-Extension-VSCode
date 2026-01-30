const vscode = require('vscode');
const {formatChatHistory} = require('../services/chatHistory');
const {safeErrorDetails} = require('../services/safeErrorDetails');

function createShowChatHistoryHandler(runtime) {
    return async function showChatHistoryHandler() {
        if (!runtime.state.chatHistory.length) {
            vscode.window.showInformationMessage('No chat history available.');
            return;
        }
        const doc = await vscode.workspace.openTextDocument({
            content: formatChatHistory(runtime.state.chatHistory),
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        runtime.logDebug('Displayed chat history', {length: runtime.state.chatHistory.length});
    };
}

function createExportChatHistoryHandler(runtime) {
    return async function exportChatHistoryHandler() {
        if (!runtime.state.chatHistory.length) {
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

        const mdContent = formatChatHistory(runtime.state.chatHistory);

        try {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(mdContent, 'utf8'));
            vscode.window.showInformationMessage('Chat history exported successfully!');
        } catch (err) {
            vscode.window.showErrorMessage('Error exporting chat history.');
            runtime.logDebug('Export chat history failed', safeErrorDetails(err));
        }
    };
}

function createClearChatHistoryHandler(runtime) {
    return async function clearChatHistoryHandler() {
        runtime.state.chatHistory = [];
        vscode.window.showInformationMessage('Chat history cleared.');
        runtime.logDebug('Chat history cleared');
    };
}

module.exports = {
    createShowChatHistoryHandler,
    createExportChatHistoryHandler,
    createClearChatHistoryHandler
};