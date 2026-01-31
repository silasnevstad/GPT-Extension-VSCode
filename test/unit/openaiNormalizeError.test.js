const assert = require('assert');
const openaiProvider = require('../../src/llm/providers/openai');

function makeAxiosError({ status, code, message }) {
    return {
        response: {
            status,
            data: { error: { code, message, type: 'invalid_request_error', param: 'model' } },
            headers: { 'openai-request-id': 'req_test_1' }
        }
    };
}

describe('openai normalizeError', () => {
    it('maps 400 + code=model_not_found to NotFoundModel', () => {
        const err = makeAxiosError({
            status: 400,
            code: 'model_not_found',
            message: 'The requested model does not exist.'
        });

        const out = openaiProvider.normalizeError(err, { provider: 'openai', model: 'nope' });
        assert.strictEqual(out.kind, 'NotFoundModel');
        assert.strictEqual(out.status, 400);
        assert.strictEqual(out.provider, 'openai');
    });

    it('keeps context-too-large mapping for 400', () => {
        const err = makeAxiosError({
            status: 400,
            code: null,
            message: 'This model\'s maximum context length is exceeded (too many tokens).'
        });

        const out = openaiProvider.normalizeError(err, { provider: 'openai', model: 'gpt-5.2' });
        assert.strictEqual(out.kind, 'ContextTooLarge');
    });
});
