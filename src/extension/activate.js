const vscode = require('vscode');
const {createRuntime} = require('./runtime/createRuntime');
const {registerCommands} = require('./commands/registerCommands');

async function activate(context) {
    const runtime = createRuntime({vscode, context});
    registerCommands(runtime, context);
}

module.exports = {activate};