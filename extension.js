const vscode = require('vscode');
const axios = require('axios').default;
const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config()

let shared_key = "API-KEY-HERE"
var private_key = "API-KEY-HERE"
let max_tokens = 64

var gpt_model = "gpt-3.5-turbo"
let possible_models = {
	"GPT 3.5 Turbo (Default)": 'gpt-3.5-turbo',
	"davinci": "text-davinci-003",
	"GPT-4": "gpt-4",
	"GPT-4-32k": "gpt-4-32k",
}

let max_tokens_options = {
	"gpt-3.5-turbo": 4096,
	"text-davinci-003": 4097,
	"gpt-4": 8192,
	"gpt-4-32k": 32768,
}

let chatHistory = [];

function activate(context) {
	

	// Register the command to execute askGPT immediately on the highlighted text
	const askGPT = vscode.commands.registerCommand('extension.askGPT', async () => {
		// Initialize the OpenAI API
		const configuration = new Configuration({ apiKey: private_key, });
		const openai = new OpenAIApi(configuration);

		const editor = vscode.window.activeTextEditor; // Get the active text editor

		if (!editor) { // If there is no active text editor, return
			return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection); // Get the text from the selection
		const messages = [...chatHistory, { role: 'user', content: `${text}` }];

		vscode.window.withProgress({ // Show a progress bar while the request is being made
			location: vscode.ProgressLocation.Notification,
			title: 'Loading response from GPT...',
			cancellable: true,
		  }, async (progress, token) => {
			try {
				// the way in which we make a request is different depending on the model
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
						messages: [{role: "user", content: `${text}`}],
					});
					explanation = completion.data.choices[0].message.content;
				}

				if (!isSucessful(completion)) {
					vscode.window.showErrorMessage(`Error getting response from GPT: Please check your API key`);
					return;
				}

				chatHistory.push({ role: 'user', content: text });
				chatHistory.push({ role: 'assistant', content: explanation });

			  	const explanationEditor = await vscode.workspace.openTextDocument({ content: explanation, language: "text" });
			  	await vscode.window.showTextDocument(explanationEditor, { viewColumn: vscode.ViewColumn.Beside });
			} catch (err) {
				if (gpt_model === "gpt-4" || gpt_model === "gpt-4-32k") {
					vscode.window.showInformationMessage('GPT-4 is currently in a limited beta and only accessible to those who have been granted access. Please check the OpenAI website for more information.');
				} else {
					vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
				}
			}
		  });
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

		private_key = apiKey
		max_tokens = 4097

		// show a success message
		vscode.window.showInformationMessage('API key set successfully!');
    });

	const changeLimit = vscode.commands.registerCommand('gpthelper.changeLimit', async function () {
		// You can only limit tokens on the davinci model
		// so if the user isn't using that model, show an info message and return
		if (gpt_model !== "text-davinci-003") {
			vscode.window.showInformationMessage('You can only change the request limit on the davinci model');
			return;
		}

		// Get the users new request limit
		const newLimit = await vscode.window.showInputBox({
			prompt: "Enter your new request limit (0-4097)",
			password: false,
		});

		// convert the new limit to a integer
		const newLimitInt = parseInt(newLimit, 10);

		// if new limit isn't > 0 and < 4097, show an error message
		if (newLimitInt < 0 || newLimitInt > 4097) {
			vscode.window.showErrorMessage('Request limit must be between 0 and 4097');
			return;
		}

		// make sure api key isn't shared key
		if (private_key === shared_key) {
			vscode.window.showErrorMessage('You must set your own API key to change the request limit');
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
    context.subscriptions.push(askGPT, setKey, changeLimit, changeModel, showChatHistory);
}

async function sendGPTRequest(text) {
	// Initialize the OpenAI API
	const configuration = new Configuration({ apiKey: private_key });
	const openai = new OpenAIApi(configuration);
  
	// Add the previous chat history to the API request
	const messages = [...chatHistory, { role: "user", content: `${text}` }];
  
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
		  messages: messages,
		});
		explanation = completion.data.choices[0].message.content;
	  }
  
	  if (!isSucessful(completion)) {
		vscode.window.showErrorMessage(`Error getting response from GPT: Please check your API key`);
		return null;
	  }
  
	  return explanation;
	} catch (err) {
	  if (gpt_model === "gpt-4" || gpt_model === "gpt-4-32k") {
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

function createChatPanel() {
	const panel = vscode.window.createWebviewPanel(
	  'gptChat',
	  'GPT Chat',
	  vscode.ViewColumn.Beside,
	  { enableScripts: true }
	);
  
	panel.webview.html = getChatHtml();
	return panel;
}

function updateChatMessages(panel) {
	const chatMessagesHtml = chatHistory
	  .map((message) =>
		`<div class="message"><span class="${message.role}">${message.role === 'user' ? 'User' : 'Assistant'}:</span> ${
		  message.content
		}</div>`
	  )
	  .join('');
  
	panel.webview.postMessage({ type: 'updateMessages', content: chatMessagesHtml });
}
  
function getChatHtml() {

	return `
	  	<!DOCTYPE html>
	  	<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>GPT Chat</title>
				<style>
					body { font-family: sans-serif; }
					#messages { height: 75vh; overflow-y: scroll; padding: 1rem; border: 1px solid #ccc; }
					.message { margin-bottom: 1rem; }
					.user { font-weight: bold; color: #007ACC; }
					.assistant { font-weight: bold; color: #A31515; }
					#input-form { display: flex; margin-top: 1rem; }
					#input-box { flex-grow: 1; }
				</style>
			</head>
			<body>
				<div id="messages"></div>
				<form id="input-form">
					<input id="input-box" type="text" />
					<button type="submit">Send</button>
				</form>
				<script>
					const vscode = acquireVsCodeApi();
					// ... (existing code)

					// Handle incoming messages from the extension
					window.addEventListener('message', (event) => {
					const message = event.data;
					switch (message.type) {
						case 'updateMessages':
						document.getElementById('messages').innerHTML = message.content;
						break;
					}
					});
				</script>
			</body>
	  	</html>
	`;
}
  
  

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
