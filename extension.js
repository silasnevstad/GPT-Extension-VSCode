const vscode = require('vscode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- Global State Variables ---
let private_key = null;
let askOutputReplace = false;  // if true, replace selected text; if false, open in new document

let gpt_model = "gpt-4o";
const possible_models = {
    'o3-mini': 'o3-mini',
    'o1': 'o1',
    'o1-mini': 'o1-mini',
    "GPT-4o": "gpt-4o",
    "GPT-4o-mini": "gpt-4o-mini",
    "GPT-4-Turbo": "gpt-4-turbo",
    "GPT-3.5-Turbo": 'gpt-3.5-turbo',
};

const max_tokens_options = {
    'o3-mini': 100000,
    "o1": 100000,
    "o1-mini": 65536,
    "gpt-4o": 16384,
    "gpt-4o-mini": 16384,
    "gpt-4-turbo": 4096,
    "gpt-3.5-turbo": 4096,
};

let debugMode = false;
let outputChannel = vscode.window.createOutputChannel("GPT Debug");

let maxOutputTokens = max_tokens_options[gpt_model];  // maximum output tokens (i.e. max_completion_tokens)
let temperature = null;  // if not set, API uses default
let topP = 1;          // default top_p value

// Chat history as an array of messages {role, content, model, timestamp}
let chatHistory = [];

// --- Utility Functions ---

// Format chat history as Markdown
function formatChatHistory() {
    return chatHistory
        .map(msg => {
            const timeStr = new Date(msg.timestamp).toLocaleTimeString();
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            const modelLabel = msg.model;
            return `${'='.repeat(10)}\n**${role} (${modelLabel}) [${timeStr}]:**\n${msg.content}\n${'='.repeat(10)}\n`;
        })
        .join('\n');
}

// Get comment prefix based on language ID (extend this mapping as needed)
function getCommentPrefix(languageId) {
    const map = {
        javascript: '// ',
        typescript: '// ',
        python: '# ',
        java: '// ',
        c: '// ',
        cpp: '// ',
        csharp: '// ',
        ruby: '# ',
        go: "// ",
        php: "// ",
    };
    return map[languageId] || '// ';
}

// --- Main Commands & Functions ---

// Ask GPT based on current selection
async function askGPTHandler(useWholeFile = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found.');
        return;
    }
    if (!private_key) {
        vscode.window.showErrorMessage('Please set your API key first. Run "GPT: Set API Key" command.');
        return;
    }
    // If useWholeFile flag is true, send the entire document; otherwise, use the current selection.
    const text = useWholeFile ? editor.document.getText() : editor.document.getText(editor.selection);
    if (!text.trim()) {
        vscode.window.showWarningMessage('No text found to send to GPT.');
        return;
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Loading response from GPT...',
        cancellable: true,
    }, async (progress, token) => {
        const startTime = Date.now();
        logDebug('Sending GPT request...', { textSnippet: text.slice(0, 50) + '...' });
        const response = await sendGPTRequest(text);
        const duration = Date.now() - startTime;
        logDebug('Received GPT response', { duration: `${duration}ms`, responseSnippet: response?.slice(0, 50) + '...' });

        if (response) {
            // Save to chat history with timestamp
            chatHistory.push({ role: 'user', content: text, model: gpt_model, timestamp: Date.now() });
            chatHistory.push({ role: 'assistant', content: response, model: gpt_model, timestamp: Date.now() });

            if (askOutputReplace && !useWholeFile) {
                // Replace current selection
                editor.edit(editBuilder => {
                    editBuilder.replace(editor.selection, response);
                }).then(success => {
                    if (success) {
                        logDebug('Replaced selected text with GPT response.');
                    } else {
                        logDebug('Failed to replace selected text.');
                    }
                });
            } else {
                // Open response in a new document
                const doc = await vscode.workspace.openTextDocument({ content: response });
                vscode.window.showTextDocument(doc).then(() => {
                    logDebug('Opened GPT response in new document.');
                });
            }
        } else {
            logDebug('No response received from GPT.');
        }
    });
}

// Send GPT request to OpenAI API
async function sendGPTRequest(text) {
    if (!private_key) {
        vscode.window.showInformationMessage('Set your API key first (GPT: Set API Key).');
        logDebug('sendGPTRequest called without API key.');
        return null;
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${private_key}`,
    };

    // Build request payload
    const data = {
        model: gpt_model,
        messages: [{ role: "user", content: text }],
        max_completion_tokens: maxOutputTokens,
        temperature: temperature !== null ? temperature : undefined,
        top_p: topP,
    };

    logDebug('Preparing GPT request', { url, data });
    try {
        const response = await axios.post(url, data, { headers });
        logDebug('Received response from GPT API', { status: response.status, data: response.data });
        if (response.status !== 200) {
            vscode.window.showErrorMessage(`Error: Received status ${response.status}.`);
            return null;
        }
        return response.data.choices[0].message.content;
    } catch (err) {
        logDebug('Error during GPT request', { error: err.toString(), stack: err.stack });
        if (err.response) {
            const status = err.response.status;
            const errorData = err.response.data;
            if (status === 404) {
                vscode.window.showErrorMessage('Model or endpoint not found. Check your model selection and API key.');
            } else if (status === 429) {
                vscode.window.showInformationMessage('Request limit reached. Please wait before trying again.');
            } else {
                vscode.window.showErrorMessage(`Error: ${err.message}`);
            }
            logDebug('GPT API error response', { status, errorData });
        } else if (err.request) {
            vscode.window.showErrorMessage('No response received from GPT API.');
            logDebug('No response from GPT API', { error: err.message });
        } else {
            vscode.window.showErrorMessage(`Unexpected error: ${err.message}`);
            logDebug('Unexpected error', { error: err.message });
        }
        return null;
    }
}

// Insert GPT response as a comment above the current line
async function insertResponseAsComment() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found.');
        return;
    }
    if (!private_key) {
        vscode.window.showErrorMessage('Set your API key first (GPT: Set API Key).');
        return;
    }
    const prompt = await vscode.window.showInputBox({ prompt: "Enter prompt for GPT (response will be inserted as comment)" });
    if (!prompt) {
        return;
    }
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Getting GPT response...',
        cancellable: true,
    }, async (progress, token) => {
        const response = await sendGPTRequest(prompt);
        if (response) {
            const languageId = editor.document.languageId;
            const commentPrefix = getCommentPrefix(languageId);
            const commentedResponse = response.split('\n').map(line => commentPrefix + line).join('\n');
            const position = editor.selection.active;
            editor.edit(editBuilder => {
                editBuilder.insert(position, commentedResponse + "\n");
            }).then(success => {
                if (success) {
                    logDebug('Inserted GPT response as comment.');
                } else {
                    logDebug('Failed to insert GPT response.');
                }
            });
        }
    });
}

// Export chat history as a markdown file
async function exportChatHistory() {
    if (chatHistory.length === 0) {
        vscode.window.showInformationMessage('No chat history to export.');
        return;
    }
    const defaultUri = vscode.workspace.workspaceFolders
        ? vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.fsPath)
        : undefined;
    const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'Markdown': ['md'] },
        saveLabel: 'Export Chat History',
    });
    if (!uri) {
        return;
    }
    const mdContent = formatChatHistory();
    fs.writeFile(uri.fsPath, mdContent, err => {
        if (err) {
            vscode.window.showErrorMessage(`Error exporting chat history: ${err.message}`);
        } else {
            vscode.window.showInformationMessage('Chat history exported successfully!');
        }
    });
}

// Log debug messages if debugMode is enabled
function logDebug(message, details = {}) {
    if (debugMode) {
        const timestamp = new Date().toISOString();
        outputChannel.show(true);
        outputChannel.appendLine(`[${timestamp}] ${message}`);
        if (Object.keys(details).length > 0) {
            outputChannel.appendLine(JSON.stringify(details, null, 2));
        }
        outputChannel.appendLine('---');
    }
}

// --- Activation & Deactivation ---

function activate(context) {
    // Load API key if already set
    const apiKey = context.globalState.get('openaiApiKey');
    if (apiKey) {
        private_key = apiKey;
    }

    // Register commands
    const commands = [
        vscode.commands.registerCommand('gpthelper.askGPT', () => askGPTHandler(false)),
        vscode.commands.registerCommand('gpthelper.askGPTFile', () => askGPTHandler(true)),
        vscode.commands.registerCommand('gpthelper.insertResponseAsComment', insertResponseAsComment),
        vscode.commands.registerCommand('gpthelper.exportChatHistory', exportChatHistory),
        vscode.commands.registerCommand('gpthelper.changeDebugMode', () => {
            debugMode = !debugMode;
            vscode.window.showInformationMessage(`Debug mode ${debugMode ? "On" : "Off"}.`);
            logDebug('Debug mode toggled', { debugMode });
        }),
        vscode.commands.registerCommand('gpthelper.changeOutputMode', () => {
            askOutputReplace = !askOutputReplace;
            vscode.window.showInformationMessage(`Output mode changed to ${askOutputReplace ? "Replace" : "New File"}.`);
            logDebug('Output mode toggled', { askOutputReplace });
        }),
        vscode.commands.registerCommand('gpthelper.changeModel', async () => {
            const newModel = await vscode.window.showQuickPick(
                Object.keys(possible_models).map(label => ({ label })),
                { placeHolder: "Select a model" }
            );
            if (!newModel) {
                return;
            }
            gpt_model = possible_models[newModel.label];
            maxOutputTokens = max_tokens_options[gpt_model];
            vscode.window.showInformationMessage(`Model changed to ${gpt_model} (Max tokens: ${maxOutputTokens.toLocaleString()}).`);
            logDebug('Model changed', { gpt_model, maxTokens: maxOutputTokens });
        }),
        vscode.commands.registerCommand('gpthelper.changeTemperature', async () => {
            const newTemperature = await vscode.window.showInputBox({
                prompt: "Enter temperature value (0.0 - 1.0)",
            });
            const newTempFloat = parseFloat(newTemperature);
            if (isNaN(newTempFloat) || newTempFloat < 0 || newTempFloat > 1) {
                vscode.window.showErrorMessage('Temperature must be between 0.0 and 1.0.');
                logDebug('Invalid temperature input', { newTemperature });
                return;
            }
            temperature = newTempFloat;
            vscode.window.showInformationMessage(`Temperature set to ${newTempFloat}.`);
            logDebug('Temperature changed', { temperature });
        }),
        vscode.commands.registerCommand('gpthelper.changeTopP', async () => {
            const newTopP = await vscode.window.showInputBox({
                prompt: "Enter top_p value (0.0 - 1.0)",
            });
            const newTopPFloat = parseFloat(newTopP);
            if (isNaN(newTopPFloat) || newTopPFloat < 0 || newTopPFloat > 1) {
                vscode.window.showErrorMessage('top_p must be between 0.0 and 1.0.');
                logDebug('Invalid top_p input', { newTopP });
                return;
            }
            topP = newTopPFloat;
            vscode.window.showInformationMessage(`top_p set to ${newTopPFloat}.`);
            logDebug('top_p changed', { topP });
        }),
        vscode.commands.registerCommand('gpthelper.setKey', async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: "Enter your OpenAI API key",
                password: true,
            });
            if (!apiKey) {
                return;
            }
            private_key = apiKey;
            maxOutputTokens = max_tokens_options[gpt_model];
            await context.globalState.update('openaiApiKey', apiKey);
            vscode.window.showInformationMessage('API key set successfully!');
            logDebug('API key set', { apiKey });
        }),
        vscode.commands.registerCommand('gpthelper.changeLimit', async () => {
            if (!private_key) {
                vscode.window.showErrorMessage('Set your API key before changing the request limit.');
                return;
            }
            const model_limit = max_tokens_options[gpt_model];
            const newLimit = await vscode.window.showInputBox({
                prompt: `Enter new request limit (0 - ${model_limit})`,
            });
            const newLimitInt = parseInt(newLimit, 10);
            if (isNaN(newLimitInt) || newLimitInt < 0 || newLimitInt > model_limit) {
                vscode.window.showErrorMessage(`Request limit must be between 0 and ${model_limit}.`);
                logDebug('Invalid request limit input', { newLimit });
                return;
            }
            maxOutputTokens = newLimitInt;
            vscode.window.showInformationMessage(`Request limit set to ${newLimitInt}.`);
            logDebug('Request limit changed', { maxTokens: maxOutputTokens });
        }),
        vscode.commands.registerCommand('gpthelper.showChatHistory', async () => {
            const historyMd = formatChatHistory();
            if (!historyMd.trim()) {
                vscode.window.showInformationMessage('No chat history available.');
                logDebug('No chat history found');
                return;
            }
            const doc = await vscode.workspace.openTextDocument({ content: historyMd, language: 'markdown' });
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            logDebug('Displayed chat history', { chatHistoryLength: chatHistory.length });
        }),
        vscode.commands.registerCommand('gpthelper.clearChatHistory', async () => {
            chatHistory = [];
            vscode.window.showInformationMessage('Chat history cleared.');
            logDebug('Chat history cleared');
        })
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
