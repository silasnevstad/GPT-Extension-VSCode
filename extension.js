const vscode = require('vscode');
const axios = require('axios');
require('dotenv').config();

let private_key = null;
let askOutputReplace = false;

let gpt_model = "gpt-4o";
let possible_models = {
    'o1-preview': 'o1-preview',
    'o1-mini': 'o1-mini',
    "GPT-4o (Default)": "gpt-4o",
    "GPT-4-Turbo": "gpt-4-turbo",
    "GPT-3.5-Turbo": 'gpt-3.5-turbo',
}

let max_tokens_options = {
    "o1-preview": 128000,
    "o1-mini": 128000,
    "gpt-3.5-turbo": 16385,
    "gpt-4o": 128000,
    "gpt-4-turbo": 128000,
}

let debugMode = false;
let outputChannel = vscode.window.createOutputChannel("GPT Debug");

// eslint-disable-next-line no-unused-vars
let maxTokens = max_tokens_options[gpt_model];

let chatHistory = [];

// Activate the extension
function activate(context) {
    const apiKey = context.globalState.get('openaiApiKey');
    if (apiKey) {
        private_key = apiKey;
    }

    // Register commands
    const askGPT = vscode.commands.registerCommand('extension.askGPT', async () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showWarningMessage('No active editor found.');
            return;
        }

        if (!private_key) {
            vscode.window.showErrorMessage('Please set your API key first. You can do this by running the "GPT: Set API Key" command.');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text.trim()) {
            vscode.window.showWarningMessage('No text selected to send to GPT.');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Loading response from GPT...',
            cancellable: true,
        }, async (progress, token) => {
            const startTime = Date.now();
            logDebug('Sending request to GPT...', { text });

            const response = await sendGPTRequest(text);

            const endTime = Date.now();
            const duration = endTime - startTime;
            logDebug('Received response from GPT', { duration: `${duration}ms`, response });

            if (response) {
                chatHistory.push({ role: 'user', content: `${text}` });
                chatHistory.push({ role: 'assistant', content: response });

                if (askOutputReplace) {
                    editor.edit(editBuilder => {
                        editBuilder.replace(selection, response);
                    }).then(success => {
                        if (success) {
                            logDebug('Replaced selected text with GPT response.');
                        } else {
                            logDebug('Failed to replace selected text.');
                        }
                    });
                } else {
                    const doc = await vscode.workspace.openTextDocument({ content: response });
                    vscode.window.showTextDocument(doc).then(() => {
                        logDebug('Opened GPT response in a new document.');
                    });
                }
            } else {
                logDebug('No response received from GPT.');
            }
        });
    });

    const changeDebugMode = vscode.commands.registerCommand('gpthelper.changeDebugMode', async () => {
        debugMode = !debugMode;
        vscode.window.showInformationMessage('Debug mode changed to ' + (debugMode ? "On" : "Off") + '!');
        logDebug('Debug mode toggled.', { debugMode });
    });

    const changeOutputMode = vscode.commands.registerCommand('gpthelper.changeOutputMode', async () => {
        askOutputReplace = !askOutputReplace;
        vscode.window.showInformationMessage('Output mode changed to ' + (askOutputReplace ? "Replace" : "New File") + '!');
        logDebug('Output mode toggled.', { askOutputReplace });
    });

    const changeModel = vscode.commands.registerCommand('gpthelper.changeModel', async function () {
        const newModel = await vscode.window.showQuickPick(Object.keys(possible_models).map(label => ({ label })), {
            placeHolder: "Select a model",
        });

        if (!newModel) {
            return;
        }

        gpt_model = possible_models[newModel.label];
        maxTokens = max_tokens_options[gpt_model];
        vscode.window.showInformationMessage('Model changed to ' + gpt_model + '!');
        logDebug('Model changed.', { gpt_model, maxTokens });
    });

    const setKey = vscode.commands.registerCommand('gpthelper.setKey', async function () {
        const apiKey = await vscode.window.showInputBox({
            prompt: "Enter your OpenAI API key",
            password: true,
        });

        if (!apiKey) {
            return;
        }

        private_key = apiKey;
        maxTokens = max_tokens_options[gpt_model];
        await context.globalState.update('openaiApiKey', apiKey);
        vscode.window.showInformationMessage('API key set successfully!');
        logDebug('API key set.', { apiKey });
    });

    const changeLimit = vscode.commands.registerCommand('gpthelper.changeLimit', async function () {
        if (!private_key) {
            vscode.window.showErrorMessage('You must set your own API key to change the request limit');
            return;
        }

        const model_limit = max_tokens_options[gpt_model];
        const newLimit = await vscode.window.showInputBox({
            prompt: "Enter your new request limit (0 - " + model_limit + ")",
            password: false,
        });

        const newLimitInt = parseInt(newLimit, 10);
        if (isNaN(newLimitInt) || newLimitInt < 0 || newLimitInt > model_limit) {
            vscode.window.showErrorMessage('Request limit must be a number between 0 and ' + model_limit);
            logDebug('Invalid request limit input.', { newLimit });
            return;
        }

        maxTokens = newLimitInt;
        vscode.window.showInformationMessage(`Request limit set to ${newLimitInt}`);
        logDebug('Request limit changed.', { maxTokens });
    });

    const showChatHistory = vscode.commands.registerCommand('gpthelper.showChatHistory', async () => {
        const chatHistoryText = chatHistory
            .map((message) => `${message.role === 'user' ? 'User' : 'GPT'}: ${message.content}`)
            .join('\n\n');

        if (!chatHistoryText) {
            vscode.window.showInformationMessage('No chat history available.');
            logDebug('Attempted to show chat history, but none exists.');
            return;
        }

        const chatHistoryEditor = await vscode.workspace.openTextDocument({ content: chatHistoryText, language: 'markdown' });
        await vscode.window.showTextDocument(chatHistoryEditor, { viewColumn: vscode.ViewColumn.Beside });
        logDebug('Displayed chat history.', { chatHistoryLength: chatHistory.length });
    });

    const clearChatHistory = vscode.commands.registerCommand('gpthelper.clearChatHistory', async () => {
        chatHistory = [];
        vscode.window.showInformationMessage('Chat history cleared.');
        logDebug('Chat history cleared.');
    });

    context.subscriptions.push(
        askGPT,
        changeDebugMode,
        changeOutputMode,
        setKey,
        changeLimit,
        changeModel,
        showChatHistory,
        clearChatHistory
    );
}

// Function to send request to GPT
async function sendGPTRequest(text) {
    if (!private_key) {
        vscode.window.showInformationMessage('Please set your API key first. You can do this by running the "GPT: Set API Key" command.');
        logDebug('sendGPTRequest called without API key.');
        return null;
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${private_key}`,
    };
    const data = {
        model: gpt_model,
        messages: [{ role: "user", content: text }],
    };

    logDebug('Preparing to send GPT request.', { url, headers, data });

    try {
        const response = await axios.post(url, data, { headers });

        logDebug('Received response from GPT.', { status: response.status, data: response.data });

        if (response.status !== 200) {
            vscode.window.showErrorMessage(`Error getting response from GPT: Please check your API key`);
            logDebug('Non-200 response received.', { status: response.status, responseData: response.data });
            return null;
        }

        return response.data.choices[0].message.content;
    } catch (err) {
        logDebug('Error during GPT request.', { error: err.toString(), stack: err.stack });

        if (err.response) {
            const status = err.response.status;
            const errorData = err.response.data;
            if (status === 404) {
                vscode.window.showErrorMessage(`Model or endpoint not found. Please check your model selection and API key.`);
            } else if (status === 429) {
                vscode.window.showInformationMessage('You have reached your request limit. Please wait a while before making another request.');
            } else {
                vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
            }
            logDebug('Error response from GPT API.', { status, errorData });
        } else if (err.request) {
            vscode.window.showErrorMessage('No response received from GPT API.');
            logDebug('No response received.', { error: err.message });
        } else {
            vscode.window.showErrorMessage(`Unexpected error: ${err.message}`);
            logDebug('Unexpected error.', { error: err.message });
        }
        return null;
    }
}

// Function to log debug messages
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

// Deactivate the extension
function deactivate() {}

module.exports = {
    activate,
    deactivate
}
