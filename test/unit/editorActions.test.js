const assert = require('assert');
const {composeFinalSystem} = require('../../src/extension/services/editorActionTemplates');
const {EDITOR_ACTIONS} = require('../../src/extension/services/editorActionTemplates');

describe('editorActionTemplates', () => {
    describe('composeFinalSystem', () => {
        it('returns template when instruction is empty', () => {
            const template = 'Do the thing.';
            assert.strictEqual(composeFinalSystem(template, ''), template);
        });

        it('treats whitespace-only instruction as empty', () => {
            const template = 'Do the thing.';
            assert.strictEqual(composeFinalSystem(template, '   '), template);
        });

        it('joins template and instruction with two newlines', () => {
            const template = 'Do the thing.';
            const instruction = 'RULES';
            assert.strictEqual(
                composeFinalSystem(template, instruction),
                `${template}\n\n${instruction}`
            );
        });

        it('handle multiline instructions correctly', () => {
            assert.strictEqual(EDITOR_ACTIONS.explainSelection.commandId, 'gpthelper.explainSelection');
            assert.strictEqual(EDITOR_ACTIONS.refactorSelection.commandId, 'gpthelper.refactorSelection');
            assert.strictEqual(EDITOR_ACTIONS.fixSelection.commandId, 'gpthelper.fixSelection');
            assert.strictEqual(EDITOR_ACTIONS.addDocComments.commandId, 'gpthelper.addDocComments');

            assert.strictEqual(EDITOR_ACTIONS.explainSelection.title, 'Ask GPT: Explain Selection');
            assert.strictEqual(EDITOR_ACTIONS.refactorSelection.title, 'Ask GPT: Refactor Selection');
            assert.strictEqual(EDITOR_ACTIONS.fixSelection.title, 'Ask GPT: Fix Selection');
            assert.strictEqual(EDITOR_ACTIONS.addDocComments.title, 'Ask GPT: Add Docstring/Comments');
        });
    });
});