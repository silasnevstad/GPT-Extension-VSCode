const vscode = require('vscode');
const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config()

let private_key = null;
// eslint-disable-next-line no-unused-vars
let maxTokens = 16000;
let askOutputReplace = false

let gpt_model = "gpt-4o";
let possible_models = {
	"GPT-4o (Default)": "gpt-4o",
	"GPT-4-Turbo": "gpt-4-turbo",
	"GPT-3.5-Turbo": 'gpt-3.5-turbo',
}

let max_tokens_options = {
	"gpt-3.5-turbo": 16385,
	"gpt-4o": 128_000,
	"gpt-4-turbo": 128_000,
}

let chatHistory = [];

function activate(context) {
	const apiKey = context.globalState.get('openaiApiKey');
	if (apiKey) {
		private_key = apiKey;
	}

	// Register the command to execute askGPT immediately on the highlighted text
	const askGPT = vscode.commands.registerCommand('extension.askGPT', async () => {
		const editor = vscode.window.activeTextEditor; // Get the active text editor

		if (!editor) { // If there is no active text editor, return
			return;
		}

		// make sure api key is set
		if (!private_key) {
			vscode.window.showErrorMessage('Please set your API key first. You can do this by running the "GPT: Set API Key" command.');
			return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection); // Get the text from the selection

		vscode.window.withProgress({ // Show a progress bar while the request is being made
			location: vscode.ProgressLocation.Notification,
			title: 'Loading response from GPT...',
			cancellable: true,
		}, async () => {
			// use sendGPTRequest to send the request to the OpenAI API
			const response = await sendGPTRequest(text);

			// update the chat history
			chatHistory.push({ role: 'user', content: `${text}` });
			chatHistory.push({ role: 'assistant', content: response });

			if (askOutputReplace) {
				// update the editor with the response
				editor.edit(editBuilder => {
					editBuilder.replace(selection, response);
				});
			} else {
				// open new file with response
				const doc = await vscode.workspace.openTextDocument({ content: response });
				vscode.window.showTextDocument(doc);
			}
		});
	});

	const changeOutputMode = vscode.commands.registerCommand('gpthelper.changeOutputMode', async () => {
		// chang askOutputReplace to the opposite of what it is
		askOutputReplace = !askOutputReplace;

		// show a success message
		vscode.window.showInformationMessage('Output mode changed to ' + (askOutputReplace ? "Replace" : "New File") + '!');
	});

	const changeModel = vscode.commands.registerCommand('gpthelper.changeModel', async function () {
		// Get the users requested model
		const newModel = await vscode.window.showQuickPick(Object.keys(possible_models).map(label => ({ label })), {
			placeHolder: "Select a model",
		});

		if (!newModel) {
			return;
		}

		gpt_model = possible_models[newModel.label]

		// show a success message
		vscode.window.showInformationMessage('Model changed to ' + gpt_model + '!');
	});

	// Register the setKey command
	const setKey = vscode.commands.registerCommand('gpthelper.setKey', async function () {
		// Get the user's API key
		const apiKey = await vscode.window.showInputBox({
			prompt: "Enter your OpenAI API key",
			password: true,
		});

		if (!apiKey) {
			return;
		}

		private_key = apiKey;
		maxTokens = max_tokens_options[gpt_model];

		// Store the API key in the global state
		await context.globalState.update('openaiApiKey', apiKey);

		// show a success message
		vscode.window.showInformationMessage('API key set successfully!');
	});

	const changeLimit = vscode.commands.registerCommand('gpthelper.changeLimit', async function () {
		// You can only limit tokens on the davinci model
		// so if the user isn't using that model, show an info message and return
		if (!private_key) {
			vscode.window.showErrorMessage('You must set your own API key to change the request limit');
			return;
		}

		const model_limit = max_tokens_options[gpt_model];

		// Get the users new request limit
		const newLimit = await vscode.window.showInputBox({
			prompt: "Enter your new request limit (0 - " + model_limit + ")",
			password: false,
		});

		// convert the new limit to a integer
		const newLimitInt = parseInt(newLimit, 10);

		// if new limit isn't > 0 and < 4097, show an error message
		if (newLimitInt < 0 || newLimitInt > model_limit) {
			vscode.window.showErrorMessage('Request limit must be between 0 and ' + model_limit);
			return;
		}

		// otherwise, set the new limit
		maxTokens = newLimitInt;

		// show information message with the new limit
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

	// Register the commands with VS Code
	context.subscriptions.push(askGPT, changeOutputMode, setKey, changeLimit, changeModel, showChatHistory, clearChatHistory);
}

async function sendGPTRequest(text) {
	if (!private_key) {
		vscode.window.showInformationMessage('Please set your API key first. You can do this by running the "GPT: Set API Key" command.');
		return null;
	}

	const configuration = new Configuration({ apiKey: private_key });
	const openai = new OpenAIApi(configuration);

	try {
		let completion = await openai.createChatCompletion({
			model: gpt_model,
			messages: [{ role: "user", content: `${text}` }],
			// max_tokens: maxTokens,
		});
		let explanation = completion.data.choices[0].message.content;

		if (!isSuccessful(completion)) {
			vscode.window.showErrorMessage(`Error getting response from GPT: Please check your API key`);
			return null;
		}

		return explanation;
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

function isSuccessful(response) {
	return response && response.status === 200;
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
