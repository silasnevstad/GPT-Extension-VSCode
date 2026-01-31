const assert = require('assert');

const anthropicProvider = require('../../src/llm/providers/anthropic');
const { LLMError } = require('../../src/llm/errors');

describe('anthropic provider normalizeError', () => {
    it('maps 404 to NotFoundModel', () => {
        const err = {
            response: {
                status: 404,
                headers: { 'x-request-id': 'req_test_a1' },
                data: {
                    error: { type: 'not_found_error', message: 'model: claude-does-not-exist' }
                }
            }
        };

        const out = anthropicProvider.normalizeError(err, { provider: 'anthropic', model: 'claude-does-not-exist' });

        assert(out instanceof LLMError);
        assert.strictEqual(out.kind, 'NotFoundModel');
        assert.strictEqual(out.provider, 'anthropic');
        assert.strictEqual(out.status, 404);
        assert.strictEqual(out.providerCode, 'not_found_error');
    });

    it('maps 401/403 to Auth', () => {
        const err = { response: { status: 401, data: { error: { type: 'authentication_error', message: 'bad key' } } } };
        const out = anthropicProvider.normalizeError(err, { provider: 'anthropic' });
        assert(out instanceof LLMError);
        assert.strictEqual(out.kind, 'Auth');
    });
});
