const vscode = require('vscode');
const { Configuration, OpenAIApi } = require("openai"); 
require('dotenv').config()

let shared_key = "API-KEY-HERE"
let private_key = "API-KEY-HERE"
let max_tokens = 64

function activate(context) {
	
	const configuration = new Configuration({
		apiKey: private_key,
	});

	const openai = new OpenAIApi(configuration);

	// Register the command to execute askGPT immediately on the highlighted text
	const askGPT = vscode.commands.registerCommand('extension.askGPT', async () => {

		const editor = vscode.window.activeTextEditor;

		if (!editor) {
		return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection);

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Loading response from GPT...',
			cancellable: false,
		  }, async (progress, token) => {
			try {
			  const response = await openai.createCompletion({
				model: "text-davinci-003",
				prompt: `${text}`,
				temperature: 0.5,
				max_tokens: max_tokens,
				top_p: 1,
				frequency_penalty: 0.3,
				presence_penalty: 0,
			  });
	  
			  const explanation = response.data.choices[0].text;
	  
			  const explanationEditor = await vscode.workspace.openTextDocument({ content: explanation, language: "text" });
			  await vscode.window.showTextDocument(explanationEditor);
			} catch (err) {
			  console.error(err);
			  vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
			}
		  });
	});

    // Register the getLimit command
    const getLimit = vscode.commands.registerCommand('gpthelper.getLimit', async function () {
        // Get the user's API key
        const apiKey = await vscode.window.showInputBox({
            prompt: "Enter your OpenAI API key",
            password: true,
        });

        if (!apiKey) {
            return;
        }

		private_key = apiKey
		max_tokens = 1024

		// show a success message
		vscode.window.showInformationMessage('API key set successfully!');
    });

	const changeLimit = vscode.commands.registerCommand('gpthelper.changeLimit', async function () {
		// Get the users new request limit
		const newLimit = await vscode.window.showInputBox({
			prompt: "Enter your new request limit",
			password: false,
		});

		// if new limit isn't > 0 and < 2048, show an error message
		// convert the new limit to a integer
		const newLimitInt = parseInt(newLimit, 10);

		if (newLimitInt < 0 || newLimitInt > 2048) {
			vscode.window.showErrorMessage('Request limit must be between 0 and 2048');
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
    context.subscriptions.push(askGPT, getLimit, changeLimit);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
