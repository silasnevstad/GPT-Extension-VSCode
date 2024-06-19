const vscode = require('vscode');
const axios = require('axios');
require('dotenv').config();

let private_key = null;
let askOutputReplace = false;

let gpt_model = "gpt-4o";
let possible_models = {
	"GPT-4o (Default)": "gpt-4o",
	"GPT-4-Turbo": "gpt-4-turbo",
	"GPT-3.5-Turbo": 'gpt-3.5-turbo',
}

let max_tokens_options = {
	"gpt-3.5-turbo": 16385,
	"gpt-4o": 128000,
	"gpt-4-turbo": 128000,
}

// eslint-disable-next-line no-unused-vars
let maxTokens = max_tokens_options[gpt_model];

let chatHistory = [];

function activate(context) {
	const apiKey = context.globalState.get('openaiApiKey');
	if (apiKey) {
		private_key = apiKey;
	}

	const askGPT = vscode.commands.registerCommand('extension.askGPT', async () => {
		const editor = vscode.window.activeTextEditor;

		if (!editor) {
			return;
		}

		if (!private_key) {
			vscode.window.showErrorMessage('Please set your API key first. You can do this by running the "GPT: Set API Key" command.');
			return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection);

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Loading response from GPT...',
			cancellable: true,
		}, async () => {
			const response = await sendGPTRequest(text);

			chatHistory.push({ role: 'user', content: `${text}` });
			chatHistory.push({ role: 'assistant', content: response });

			if (askOutputReplace) {
				editor.edit(editBuilder => {
					editBuilder.replace(selection, response);
				});
			} else {
				const doc = await vscode.workspace.openTextDocument({ content: response });
				vscode.window.showTextDocument(doc);
			}
		});
	});

	const changeOutputMode = vscode.commands.registerCommand('gpthelper.changeOutputMode', async () => {
		askOutputReplace = !askOutputReplace;
		vscode.window.showInformationMessage('Output mode changed to ' + (askOutputReplace ? "Replace" : "New File") + '!');
	});

	const changeModel = vscode.commands.registerCommand('gpthelper.changeModel', async function () {
		const newModel = await vscode.window.showQuickPick(Object.keys(possible_models).map(label => ({ label })), {
			placeHolder: "Select a model",
		});

		if (!newModel) {
			return;
		}

		gpt_model = possible_models[newModel.label];
		vscode.window.showInformationMessage('Model changed to ' + gpt_model + '!');
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
		if (newLimitInt < 0 || newLimitInt > model_limit) {
			vscode.window.showErrorMessage('Request limit must be between 0 and ' + model_limit);
			return;
		}

		maxTokens = newLimitInt;
		vscode.window.showInformationMessage(`Request limit set to ${newLimitInt}`);
	});

	const showChatHistory = vscode.commands.registerCommand('gpthelper.showChatHistory', async () => {
		const chatHistoryText = chatHistory
			.map((message) => `${message.role === 'user' ? 'User' : 'GPT'}: ${message.content}`)
			.join('\n\n');

		if (!chatHistoryText) {
			vscode.window.showInformationMessage('No chat history available.');
			return;
		}

		const chatHistoryEditor = await vscode.workspace.openTextDocument({ content: chatHistoryText, language: 'text' });
		await vscode.window.showTextDocument(chatHistoryEditor, { viewColumn: vscode.ViewColumn.Beside });
	});

	const clearChatHistory = vscode.commands.registerCommand('gpthelper.clearChatHistory', async () => {
		chatHistory = [];
		vscode.window.showInformationMessage('Chat history cleared.');
	});

	context.subscriptions.push(askGPT, changeOutputMode, setKey, changeLimit, changeModel, showChatHistory, clearChatHistory);
}

async function sendGPTRequest(text) {
	if (!private_key) {
		vscode.window.showInformationMessage('Please set your API key first. You can do this by running the "GPT: Set API Key" command.');
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

	try {
		const response = await axios.post(url, data, { headers });

		if (response.status !== 200) {
			vscode.window.showErrorMessage(`Error getting response from GPT: Please check your API key`);
			return null;
		}

		return response.data.choices[0].message.content;
	} catch (err) {
		if (err && err.response) {
			const status = err.response.status;
			if (status === 404) {
				vscode.window.showErrorMessage(`Model or endpoint not found. Please check your model selection and API key.`);
			} else if (status === 429) {
				vscode.window.showInformationMessage('You have reached your request limit. Please wait a while before making another request.');
			} else {
				vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
			}
		} else {
			vscode.window.showErrorMessage(`Unexpected error: ${err.message}`);
		}
		return null;
	}
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
