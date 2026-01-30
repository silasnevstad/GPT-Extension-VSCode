function createState() {
    return {
        extensionContext: null,
        outputReplace: false,
        debugMode: false,
        llmRouter: null,
        instructionManager: null,
        outputChannel: null,
        chatHistory: [],
        contextMode: 'none',
        contextLength: 3,
        temperature: null,
        topP: null,
        secretStorageWarned: false
    };
}

module.exports = {createState};