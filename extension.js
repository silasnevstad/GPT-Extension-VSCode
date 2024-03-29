const vscode = require('vscode');
const axios = require('axios').default;
const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config()

var private_key = null
let max_tokens = 1000
let askOutputReplace = false

var gpt_model = "gpt-4-0125-preview"
let possible_models = {
	"GPT-4-Turbo (Default)": "gpt-4-0125-preview",
	"GPT 3.5 Turbo": 'gpt-3.5-turbo',
	"GPT-4": "gpt-4",
	"davinci": "text-davinci-003",
}

let max_tokens_options = {
	"gpt-3.5-turbo": 4096,
	"text-davinci-003": 4097,
	"gpt-4": 8192,
	"gpt-4-0125-preview": 100000,
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
			vscode.window.showErrorMessage('You must set your own API key to change the request limit');
			return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection); // Get the text from the selection

		vscode.window.withProgress({ // Show a progress bar while the request is being made
			location: vscode.ProgressLocation.Notification,
			title: 'Loading response from GPT...',
			cancellable: true,
		  }, async (progress, token) => {
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
		max_tokens = 4097;
	
		// Store the API key in the global state
		await context.globalState.update('openaiApiKey', apiKey);
	
		// show a success message
		vscode.window.showInformationMessage('API key set successfully!');
	});

	const changeLimit = vscode.commands.registerCommand('gpthelper.changeLimit', async function () {
		// You can only limit tokens on the davinci model
		// so if the user isn't using that model, show an info message and return
		if (gpt_model !== "text-davinci-003") {
			vscode.window.showInformationMessage('You can only change the request limit on the davinci model');
			return;
		} else if (!private_key) {
			vscode.window.showErrorMessage('You must set your own API key to change the request limit');
			return;
		}

		// Get the users new request limit
		const newLimit = await vscode.window.showInputBox({
			prompt: "Enter your new request limit (0-4097)",
			password: false,
		});

		// convert the new limit to a integer
		const newLimitInt = parseInt(newLimit, 10);

		const model_limit = max_tokens_options[gpt_model]

		// if new limit isn't > 0 and < 4097, show an error message
		if (newLimitInt < 0 || newLimitInt > model_limit) {
			vscode.window.showErrorMessage('Request limit must be between 0 and ' + model_limit);
			return;
		}



		// otherwise, set the new limit
		max_tokens = newLimitInt;

		// show information message with the new limit
		vscode.window.showInformationMessage(`Request limit set to ${newLimitInt}`);
	});

	const showChatHistory = vscode.commands.registerCommand('gpthelper.showChatHistory', async () => {
		const chatHistoryText = chatHistory
		  .map((message, index) => `${message.role === 'user' ? 'User' : 'GPT'}: ${message.content}`)
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
	// Check if the user has set their API key, and show info message if not
	if (!private_key) {
		vscode.window.showInformationMessage('Please set your API key first. You can do this by running the "GPT: Set API Key" command.');
		return null;
	}

	// Initialize the OpenAI API
	const configuration = new Configuration({ apiKey: private_key });
	const openai = new OpenAIApi(configuration);
  
	try {
	  let completion, explanation;
	  if (gpt_model === "text-davinci-003") {
		completion = await openai.createCompletion({
		  model: "text-davinci-003",
		  prompt: `${text}`,
		  temperature: 0.5,
		  max_tokens: max_tokens,
		  top_p: 1,
		  frequency_penalty: 0.3,
		  presence_penalty: 0,
		});
		explanation = completion.data.choices[0].text;
	  } else {
		completion = await openai.createChatCompletion({
		  model: gpt_model,
		  messages: [{ role: "user", content: `${text}` }],
		});
		explanation = completion.data.choices[0].message.content;
	  }
  
	  if (!isSucessful(completion)) {
		vscode.window.showErrorMessage(`Error getting response from GPT: Please check your API key`);
		return null;
	  }
  
	  return explanation;
	} catch (err) {
	  if (err && err.response && err.response.status === 429) {
		vscode.window.showInformationMessage('You have reached your request limit. Please wait a while before making another request.');
		return null;
	  } else if (gpt_model === "gpt-4" || gpt_model === "gpt-4-32k") {
		vscode.window.showInformationMessage(
		  "GPT-4 is currently in a limited beta and only accessible to those who have been granted access. Please check the OpenAI website for more information."
		);
	  } else {
		vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
	  }
	  return null;
	}
}
  

function isSucessful(response) {
	return response.status === 200; // 200 is the status code for a successful request
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
