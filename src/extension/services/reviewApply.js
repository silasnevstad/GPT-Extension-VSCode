const vscode = require('vscode');

async function showDiffAndConfirmApply(_editor, originalText, proposedText, title) {
    const leftDoc = await vscode.workspace.openTextDocument({content: originalText});
    const rightDoc = await vscode.workspace.openTextDocument({content: proposedText});

    await vscode.commands.executeCommand('vscode.diff', leftDoc.uri, rightDoc.uri, title);

    const choice = await vscode.window.showInformationMessage(
        'Apply these changes?',
        {modal: true},
        'Apply',
        'Cancel'
    );

    return choice === 'Apply';
}

function applySelectionEdit(editor, newText) {
    return editor.edit(editBuilder => {
        editBuilder.replace(editor.selection, newText);
    });
}

module.exports = {showDiffAndConfirmApply, applySelectionEdit};