const vscode = require('vscode');
const axios = require('axios').default;
const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config()

let shared_key = "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"
let private_key = "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"
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

			  	const explanationEditor = await vscode.workspace.openTextDocument({ content: explanation, language: "text" });
			  	await vscode.window.showTextDocument(explanationEditor);
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

    // Register the commands with VS Code
    context.subscriptions.push(askGPT, setKey, changeLimit, changeModel);
}

function isSucessful(response) {
	return response.status === 200; // 200 is the status code for a successful request
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
