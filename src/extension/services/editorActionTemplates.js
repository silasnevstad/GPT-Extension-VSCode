const EDITOR_ACTIONS = {
    explainSelection: {
        commandId: 'gpthelper.explainSelection',
        title: 'Ask GPT: Explain Selection',
        progressTitle: 'Explaining selection…',
        actionTemplate: [
            "Explain the user's selection clearly and concisely. ",
            "Focus on purpose, key logic, assumptions, and non-obvious behavior/edge cases. ",
            "Do not propose changes unless explicitly asked. ",
            "Operate only on the selection; do not reference files outside the selection. ",
            "Output only the explanation text (no markdown, no extra commentary)."
        ].join('')
    },
    refactorSelection: {
        commandId: 'gpthelper.refactorSelection',
        title: 'Ask GPT: Refactor Selection',
        progressTitle: 'Refactoring selection…',
        actionTemplate: [
            "Refactor the user's selection for readability and maintainability. ",
            "Preserve behavior and public API. Operate only on the selection. ",
            "Output only the rewritten selection text (no markdown, no commentary)."
        ].join('')
    },
    fixSelection: {
        commandId: 'gpthelper.fixSelection',
        title: 'Ask GPT: Fix Selection',
        progressTitle: 'Fixing selection…',
        actionTemplate: [
            "Fix bugs and edge cases in the user's selection. ",
            "Preserve intended behavior and public API. Operate only on the selection. ",
            "Output only the corrected selection text (no markdown, no commentary)."
        ].join('')
    },
    addDocComments: {
        commandId: 'gpthelper.addDocComments',
        title: 'Ask GPT: Add Docstring/Comments',
        progressTitle: 'Adding docstrings/comments…',
        actionTemplate: [
            "Add concise docstrings and/or comments to the user's selection. ",
            "Do not change behavior. Operate only on the selection. ",
            "Output only the updated selection text (no markdown, no commentary)."
        ].join('')
    }
};

function composeFinalSystem(actionTemplate, projectInstruction) {
    const trimmedInstruction = typeof projectInstruction === 'string'
        ? projectInstruction.trim()
        : '';

    if (trimmedInstruction.length > 0) {
        // Spec composition: template + "\n\n" + projectInstruction
        return `${actionTemplate}\n\n${projectInstruction}`;
    }

    return actionTemplate;
}

module.exports = {EDITOR_ACTIONS, composeFinalSystem};