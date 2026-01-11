const assert = require('assert');
const {
    isProviderId,
    staticModels,
    buildPickerItems,
    getDefaultModel,
    getKnownMaxOutputTokens
} = require('../../src/llm/modelRegistry');

describe('modelRegistry.js', () => {
    it('isProviderId validates known providers', () => {
        assert.strictEqual(isProviderId('openai'), true);
        assert.strictEqual(isProviderId('anthropic'), true);
        assert.strictEqual(isProviderId('gemini'), true);
        assert.strictEqual(isProviderId('nope'), false);
    });

    it('staticModels returns arrays for each provider', () => {
        assert(Array.isArray(staticModels('openai')));
        assert(Array.isArray(staticModels('anthropic')));
        assert(Array.isArray(staticModels('gemini')));
    });

    it('buildPickerItems orders refresh -> models -> custom', () => {
        const models = [{ label: 'A', id: 'a' }, { label: 'B', id: 'b' }];
        const items = buildPickerItems(models);
        assert.strictEqual(items[0].id, '__refresh__');
        assert.strictEqual(items[items.length - 1].id, '__custom__');
        assert.strictEqual(items[1].id, 'a');
    });

    it('getDefaultModel returns per-provider default', () => {
        assert.strictEqual(getDefaultModel('openai'), 'gpt-5.2');
        assert.strictEqual(getDefaultModel('anthropic'), 'claude-sonnet-4-5-20250929');
        assert.strictEqual(getDefaultModel('gemini'), 'gemini-2.5-flash');
    });

    it('getKnownMaxOutputTokens returns known caps for OpenAI models', () => {
        assert.strictEqual(getKnownMaxOutputTokens('openai', 'o3-mini'), 100000);
        assert.strictEqual(getKnownMaxOutputTokens('openai', 'gpt-4-turbo'), 4096);
        assert.strictEqual(getKnownMaxOutputTokens('openai', 'unknown'), null);
        assert.strictEqual(getKnownMaxOutputTokens('gemini', 'anything'), null);
    });
});
