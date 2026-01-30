const vscode = require('vscode');

function createChangeTemperatureHandler(runtime) {
    return async function changeTemperatureHandler() {
        const providerId = runtime.llmRouter.getActiveProviderId();

        const current = (typeof runtime.state.temperature === 'number') ? runtime.state.temperature : null;

        const action = await vscode.window.showQuickPick(
            [
                {label: `Set temperature…${current === null ? '' : ` (current: ${current})`}`, value: 'set'},
                {label: 'Use provider default (unset)', value: 'unset'}
            ],
            {placeHolder: 'Temperature setting'}
        );
        if (!action) return;

        if (action.value === 'unset') {
            runtime.state.temperature = null;
            vscode.window.showInformationMessage('Temperature unset (provider default).');
            runtime.logDebug('Temperature changed', {temperature: null});
            return;
        }

        const raw = await vscode.window.showInputBox({
            prompt: 'Enter temperature (0.0 - 1.0)',
            value: current === null ? undefined : String(current)
        });
        if (!raw) return;

        const val = parseFloat(raw);
        if (!Number.isFinite(val) || val < 0 || val > 1) {
            vscode.window.showErrorMessage('Temperature must be between 0.0 and 1.0.');
            return;
        }

        // Anthropic constraint UX
        if (providerId === 'anthropic' && typeof runtime.state.topP === 'number') {
            const choice = await vscode.window.showWarningMessage(
                'Anthropic does not support using both temperature and top-p. Setting temperature will unset top-p.',
                'Proceed',
                'Cancel'
            );
            if (choice !== 'Proceed') return;
            runtime.state.topP = null;
        }

        runtime.state.temperature = val;
        vscode.window.showInformationMessage(`Temperature set to ${val}.`);
        runtime.logDebug('Temperature changed', {temperature: val});
    };
}

function createChangeTopPHandler(runtime) {
    return async function changeTopPHandler() {
        const providerId = runtime.llmRouter.getActiveProviderId();

        const current = (typeof runtime.state.topP === 'number') ? runtime.state.topP : null;

        const action = await vscode.window.showQuickPick(
            [
                {label: `Set top_p…${current === null ? '' : ` (current: ${current})`}`, value: 'set'},
                {label: 'Use provider default (unset)', value: 'unset'}
            ],
            {placeHolder: 'Top_p setting'}
        );
        if (!action) return;

        if (action.value === 'unset') {
            runtime.state.topP = null;
            vscode.window.showInformationMessage('top_p unset (provider default).');
            runtime.logDebug('top_p changed', {topP: null});
            return;
        }

        const raw = await vscode.window.showInputBox({
            prompt: 'Enter top_p (0.0 - 1.0)',
            value: current === null ? undefined : String(current)
        });
        if (!raw) return;

        const val = parseFloat(raw);
        if (!Number.isFinite(val) || val < 0 || val > 1) {
            vscode.window.showErrorMessage('top_p must be between 0.0 and 1.0.');
            return;
        }

        // Anthropic constraint UX
        if (providerId === 'anthropic' && typeof runtime.state.temperature === 'number') {
            const choice = await vscode.window.showWarningMessage(
                'Anthropic does not support using both temperature and top-p. Setting top-p will unset temperature.',
                'Proceed',
                'Cancel'
            );
            if (choice !== 'Proceed') return;
            runtime.state.temperature = null;
        }

        runtime.state.topP = val;
        vscode.window.showInformationMessage(`top_p set to ${val}.`);
        runtime.logDebug('top_p changed', {topP: val});
    };
}

module.exports = {createChangeTemperatureHandler, createChangeTopPHandler};