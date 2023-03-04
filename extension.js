
const vscode = require('vscode');
const axios = require('axios').default;
const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config()

const private_key = "API-KEY-HERE"

function activate(context) {
	
	const configuration = new Configuration({
		apiKey: private_key,
	});

	const openai = new OpenAIApi(configuration);

	// Register the command to execute askGPT immediately on the highlighted text
	let disposable = vscode.commands.registerCommand('extension.askGPT', async () => {

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
				max_tokens: 64,
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


  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
