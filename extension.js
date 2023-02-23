const vscode = require('vscode');
const axios = require('axios').default;
const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config()

const private_key = "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"

function activate(context) {
    const configuration = new Configuration({
        apiKey: private_key,
		// organization: process.env.OPENAI_ORGANIZATION,
    });
    const openai = new OpenAIApi(configuration);

    let analyzeDisposable = vscode.commands.registerCommand('gpthelper.analyzeSelection', async function () {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        // Get the selected texts
        const selection = editor.selection;
        const text = editor.document.getText(selection);

        // Call the ChatGPT API to analyze the selected text
        try {
			const response = await openai.createCompletion({
				model: "text-davinci-003",
				prompt: `Explain this code:\n\n${text}`,
				temperature: 0.3,
				max_tokens: 64,
				top_p: 1,
				frequency_penalty: 0.59,
				presence_penalty: 0,
				stop: ["\"\"\""],
			  });
			

			// Get the explanation from the response
			const explanation = response.data.choices[0].text;

            // Show the explanation in a new editor
            const explanationEditor = await vscode.workspace.openTextDocument({ content: explanation, language: "text" });
            await vscode.window.showTextDocument(explanationEditor);
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
        }
    });

	let debugDisposable = vscode.commands.registerCommand('gpthelper.debugSelection', async function () {
		// Get the active text editor
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection);

		// Call the ChatGPT API to analyze the selected text
		try {
			const response = await openai.createCompletion({
				model: "text-davinci-003",
				prompt: `Debug this code:\n\n${text}`,
				temperature: 0.3,
				max_tokens: 64,
				top_p: 1,
				frequency_penalty: 0.59,
				presence_penalty: 0,
				stop: ["\"\"\""],
			});

			// Get the explanation from the response
			const explanation = response.data.choices[0].text;

			// Show the explanation in a new editor
			const explanationEditor = await vscode.workspace.openTextDocument({ content: explanation, language: "text" });
			await vscode.window.showTextDocument(explanationEditor);
		} catch (err) {
			console.error(err);
			vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
		}
	});

	let optimizeDisposable = vscode.commands.registerCommand('gpthelper.optimizeSelection', async function () {
		// Get the active text editor
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection);

		// Call the ChatGPT API to analyze the selected text
		try {
			const response = await openai.createCompletion({
				model: "text-davinci-003",
				prompt: `Optimize this code:\n\n${text}`,
				temperature: 0.3,
				max_tokens: 64,
				top_p: 1,
				frequency_penalty: 0.59,
				presence_penalty: 0,
				stop: ["\"\"\""],
			});

			// Get the explanation from the response
			const explanation = response.data.choices[0].text;

			// Show the explanation in a new editor
			const explanationEditor = await vscode.workspace.openTextDocument({ content: explanation, language: "text" });
			await vscode.window.showTextDocument(explanationEditor);
		} catch (err) {
			console.error(err);
			vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
		}
	});

	let askGPT = vscode.commands.registerCommand('gpthelper.askGPT', async function () {
		// Get the active text editor
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const selection = editor.selection;
		const text = editor.document.getText(selection);

		// Call the ChatGPT API to analyze the selected text
		try {
			const response = await openai.createCompletion({
				model: "text-davinci-003",
				prompt: `${text}`,
				temperature: 0.5,
				max_tokens: 64,
				top_p: 1,
				frequency_penalty: 0.3,
				presence_penalty: 0,
				stop: ["\"\"\""],
			});

			// Get the explanation from the response
			const explanation = response.data.choices[0].text;

			// Show the explanation in a new editor
			const explanationEditor = await vscode.workspace.openTextDocument({ content: explanation, language: "text" });
			await vscode.window.showTextDocument(explanationEditor);
		} catch (err) {
			console.error(err);
			vscode.window.showErrorMessage(`Error explaining selection: ${err.message}`);
		}
	});

	context.subscriptions.push(analyzeDisposable);
	context.subscriptions.push(debugDisposable);
	context.subscriptions.push(optimizeDisposable);
	context.subscriptions.push(askGPT);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
