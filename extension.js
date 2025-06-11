const vscode = require('vscode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- Global State Variables ---
let privateKey = null;          // OpenAI API Key
let outputReplace = false;      // If true, replace text selection; if false, open new doc
let gptModel = "gpt-4o";        // Default model
let debugMode = false;

// Conversation context settings
let contextMode = 'none';       // 'none' | 'lastN' | 'full'
let contextLength = 3;          // Used if contextMode === 'lastN'

// Max tokens per model
const modelMaxTokens = {
    "o3-mini": 100000,
    "o1": 100000,
    "o1-mini": 65536,
    "gpt-4o": 16384,
    "gpt-4o-mini": 16384,
    "gpt-4-turbo": 4096,
    "gpt-3.5-turbo": 4096
};

// Map display names to actual model IDs
const modelMap = {
    "o3-mini": "o3-mini",
    "o1": "o1",
    "o1-mini": "o1-mini",
    "GPT-4o": "gpt-4o",
    "GPT-4o-mini": "gpt-4o-mini",
    "GPT-4-Turbo": "gpt-4-turbo",
    "GPT-3.5-Turbo": "gpt-3.5-turbo"
};

let maxTokens = modelMaxTokens[gptModel];
let temperature = null;  // If not set, API uses default
let topP = 1;            // Default top_p

// Debug logger
const outputChannel = vscode.window.createOutputChannel("GPT Debug");

function logDebug(message, details = {}) {
    if (!debugMode) return;
    const timestamp = new Date().toISOString();
    outputChannel.show(true);
    outputChannel.appendLine(`[${timestamp}] ${message}`);
    if (Object.keys(details).length > 0) {
        outputChannel.appendLine(JSON.stringify(details, null, 2));
    }
    outputChannel.appendLine('---');
}

// In-memory chat history
let chatHistory = [];

// Cached project instruction
let projectInstruction = '';

// Load project instruction from a ".gpt-instruction" file in the workspace
function loadProjectInstruction() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || !folders.length) {
        projectInstruction = '';
        return;
    }

    const filePath = path.join(folders[0].uri.fsPath, '.gpt-instruction');
    try {
        projectInstruction = fs.existsSync(filePath)
            ? fs.readFileSync(filePath, 'utf8')
            : '';
    } catch (err) {
        logDebug('Error reading .gpt-instruction', { error: err.message });
        projectInstruction = '';
    }
}

// Format chat history as Markdown
function formatChatHistory() {
    return chatHistory
        .map(msg => {
            const timeStr = new Date(msg.timestamp).toLocaleTimeString();
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            return `${'='.repeat(10)}\n**${role} (${msg.model}) [${timeStr}]:**\n${msg.content}\n${'='.repeat(10)}\n`;
        })
        .join('\n');
}

// Build messages array from chat history based on contextMode
function buildMessages(userPrompt, instruction) {
    let relevantHistory = [];

    switch (contextMode) {
        case 'full':
            // All messages
            relevantHistory = chatHistory;
            break;
        case 'lastN':
            // Last N messages
            relevantHistory = chatHistory.slice(-contextLength);
            break;
        case 'none':
        default:
            // No context
            relevantHistory = [];
            break;
    }

    const messages = [];
    if (instruction) {
        messages.push({ role: 'system', content: instruction });
    }
    messages.push(...relevantHistory.map(msg => ({
        role: msg.role,
        content: msg.content
    })));
    // Add the new user message
    messages.push({ role: 'user', content: userPrompt });
    return messages;
}

// Send GPT request (multi-turn aware via buildMessages)
async function sendGPTRequest(userPrompt, instruction) {
    if (!privateKey) {
        vscode.window.showErrorMessage('Please set your API key first (GPT: Set API Key).');
        logDebug('No API key set');
        return null;
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${privateKey}`
    };

    const data = {
        model: gptModel,
        messages: buildMessages(userPrompt, instruction),
        max_completion_tokens: maxTokens,
        temperature: temperature !== null ? temperature : undefined,
        top_p: topP
    };

    logDebug('Sending GPT request', { gptModel, maxTokens, temperature, topP, contextMode, contextLength });
    try {
        const response = await axios.post(url, data, { headers });
        if (response.status !== 200) {
            vscode.window.showErrorMessage(`Error: Received status ${response.status}`);
            return null;
        }
        return response.data.choices[0].message.content;
    } catch (err) {
        if (err.response) {
            const { status, data: errorData } = err.response;
            if (status === 404) {
                vscode.window.showErrorMessage('Model or endpoint not found. Check your model and API key.');
            } else if (status === 429) {
                vscode.window.showWarningMessage('Request limit reached. Please wait before trying again.');
            } else if (status === 401 || status === 403) {
                vscode.window.showErrorMessage('Invalid or unauthorized API key. Please check your key.');
            } else {
                vscode.window.showErrorMessage(`Error: ${err.message}`);
            }
            logDebug('GPT API error', { status, errorData });
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

// Ask GPT command (with selection or entire file)
async function askGPTHandler(useWholeFile = false) {
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

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Asking GPT...',
        cancellable: true
    }, async () => {
        const startTime = Date.now();
        const response = await sendGPTRequest(queryText, projectInstruction);
        const duration = Date.now() - startTime;
        logDebug('GPT response time', { durationMs: duration });

        if (response) {
            // Save to chat history
            chatHistory.push({ role: 'user', content: queryText, model: gptModel, timestamp: Date.now() });
            chatHistory.push({ role: 'assistant', content: response, model: gptModel, timestamp: Date.now() });

            if (outputReplace && !useWholeFile) {
                // Replace selected text
                editor.edit(editBuilder => {
                    editBuilder.replace(editor.selection, response);
                });
            } else {
                // Open response in a new document
                const doc = await vscode.workspace.openTextDocument({ content: response });
                vscode.window.showTextDocument(doc);
            }
        }
    });
}

// Export chat history as Markdown
async function exportChatHistory() {
    if (!chatHistory.length) {
        vscode.window.showInformationMessage('No chat history to export.');
        return;
    }

    const defaultUri = vscode.workspace.workspaceFolders
        ? vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.fsPath)
        : undefined;

    const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'Markdown': ['md'] },
        saveLabel: 'Export Chat History'
    });
    if (!uri) return;

    const mdContent = formatChatHistory();
    fs.writeFile(uri.fsPath, mdContent, err => {
        if (err) {
            vscode.window.showErrorMessage(`Error exporting: ${err.message}`);
        } else {
            vscode.window.showInformationMessage('Chat history exported successfully!');
        }
    });
}

// Change context mode (none, lastN, full)
async function changeContextMode() {
    const pick = await vscode.window.showQuickPick([
        { label: 'No Context', value: 'none' },
        { label: 'Last N Messages', value: 'lastN' },
        { label: 'Full', value: 'full' }
    ], { placeHolder: 'Select a conversation context mode' });

    if (!pick) return;
    contextMode = pick.value;

    vscode.window.showInformationMessage(`Context mode set to: ${pick.label}`);
    logDebug('Context mode changed', { contextMode });
}

// Set how many messages are used if in 'lastN' mode
async function setContextLength() {
    const val = await vscode.window.showInputBox({
        prompt: `Number of messages to include (current: ${contextLength})`
    });
    if (!val) return;

    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 1) {
        vscode.window.showWarningMessage('Please enter a positive integer.');
        return;
    }
    contextLength = parsed;
    vscode.window.showInformationMessage(`Context length set to ${contextLength}`);
    logDebug('Context length changed', { contextLength });
}

// --- Activation & Deactivation ---
function activate(context) {
    // Load existing API key
    const apiKey = context.globalState.get('openaiApiKey');
    if (apiKey) privateKey = apiKey;

    // Load .gpt-instruction file once
    loadProjectInstruction();

    // Watch for changes .gpt-instruction file
    const watcher = vscode.workspace.createFileSystemWatcher('**/.gpt-instruction');
    watcher.onDidCreate(loadProjectInstruction);
    watcher.onDidChange(loadProjectInstruction);
    watcher.onDidDelete(() => projectInstruction = '');
    context.subscriptions.push(watcher);

    // Register commands
    const commands = [
        // Ask GPT (selection)
        vscode.commands.registerCommand('gpthelper.askGPT', () => askGPTHandler(false)),

        // Ask GPT (entire file)
        vscode.commands.registerCommand('gpthelper.askGPTFile', () => askGPTHandler(true)),

        // Export conversation
        vscode.commands.registerCommand('gpthelper.exportChatHistory', exportChatHistory),

        // Debug mode toggle
        vscode.commands.registerCommand('gpthelper.changeDebugMode', () => {
            debugMode = !debugMode;
            vscode.window.showInformationMessage(`Debug mode is now ${debugMode ? "On" : "Off"}.`);
            logDebug('Debug mode toggled', { debugMode });
        }),

        // Output mode toggle
        vscode.commands.registerCommand('gpthelper.changeOutputMode', () => {
            outputReplace = !outputReplace;
            vscode.window.showInformationMessage(`Output mode: ${outputReplace ? "Replace Selection" : "New File"}.`);
            logDebug('Output mode toggled', { outputReplace });
        }),

        // Change model
        vscode.commands.registerCommand('gpthelper.changeModel', async () => {
            const pick = await vscode.window.showQuickPick(
                Object.keys(modelMap).map(label => ({ label })),
                { placeHolder: "Select a model" }
            );
            if (!pick) return;
            gptModel = modelMap[pick.label];
            maxTokens = modelMaxTokens[gptModel];
            vscode.window.showInformationMessage(`Model changed to ${gptModel} (max tokens: ${maxTokens}).`);
            logDebug('Model changed', { gptModel, maxTokens });
        }),

        // Change temperature
        vscode.commands.registerCommand('gpthelper.changeTemperature', async () => {
            const newTemp = await vscode.window.showInputBox({
                prompt: "Enter temperature (0.0 - 1.0)"
            });
            if (!newTemp) return;
            const val = parseFloat(newTemp);
            if (isNaN(val) || val < 0 || val > 1) {
                vscode.window.showErrorMessage('Temperature must be between 0.0 and 1.0.');
                return;
            }
            temperature = val;
            vscode.window.showInformationMessage(`Temperature set to ${val}.`);
            logDebug('Temperature changed', { temperature });
        }),

        // Change top_p
        vscode.commands.registerCommand('gpthelper.changeTopP', async () => {
            const newVal = await vscode.window.showInputBox({
                prompt: "Enter top_p (0.0 - 1.0)"
            });
            if (!newVal) return;
            const val = parseFloat(newVal);
            if (isNaN(val) || val < 0 || val > 1) {
                vscode.window.showErrorMessage('top_p must be between 0.0 and 1.0.');
                return;
            }
            topP = val;
            vscode.window.showInformationMessage(`top_p set to ${val}.`);
            logDebug('top_p changed', { topP });
        }),

        // Set API key
        vscode.commands.registerCommand('gpthelper.setKey', async () => {
            const newKey = await vscode.window.showInputBox({
                prompt: "Enter your OpenAI API key",
                password: true
            });
            if (!newKey) return;
            privateKey = newKey;
            await context.globalState.update('openaiApiKey', newKey);
            vscode.window.showInformationMessage('API key set successfully!');
            logDebug('API key set');
        }),

        // Change request token limit
        vscode.commands.registerCommand('gpthelper.changeLimit', async () => {
            if (!privateKey) {
                vscode.window.showErrorMessage('Set your API key before changing the token limit.');
                return;
            }
            const limitPrompt = await vscode.window.showInputBox({
                prompt: `Enter new token limit (0 - ${modelMaxTokens[gptModel]})`
            });
            if (!limitPrompt) return;
            const val = parseInt(limitPrompt, 10);
            if (isNaN(val) || val < 0 || val > modelMaxTokens[gptModel]) {
                vscode.window.showErrorMessage(`Token limit must be between 0 and ${modelMaxTokens[gptModel]}.`);
                return;
            }
            maxTokens = val;
            vscode.window.showInformationMessage(`Token limit set to ${val}.`);
            logDebug('Token limit changed', { maxTokens });
        }),

        // Context Mode
        vscode.commands.registerCommand('gpthelper.changeContextMode', changeContextMode),

        // Context Length
        vscode.commands.registerCommand('gpthelper.setContextLength', setContextLength),

        // Show chat history
        vscode.commands.registerCommand('gpthelper.showChatHistory', async () => {
            if (!chatHistory.length) {
                vscode.window.showInformationMessage('No chat history available.');
                return;
            }
            const doc = await vscode.workspace.openTextDocument({
                content: formatChatHistory(),
                language: 'markdown'
            });
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            logDebug('Displayed chat history', { length: chatHistory.length });
        }),

        // Clear chat history
        vscode.commands.registerCommand('gpthelper.clearChatHistory', () => {
            chatHistory = [];
            vscode.window.showInformationMessage('Chat history cleared.');
            logDebug('Chat history cleared');
        })
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
}

function deactivate() {}

module.exports = { activate, deactivate };
