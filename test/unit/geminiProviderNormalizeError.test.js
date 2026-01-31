const assert = require('assert');

const geminiProvider = require('../../src/llm/providers/gemini');
const { LLMError } = require('../../src/llm/errors');

describe('gemini provider normalizeError', () => {
    it('maps 404/NOT_FOUND to NotFoundModel', () => {
        const err = {
            response: {
                status: 404,
                headers: { 'x-request-id': 'req_test_g1' },
                data: {
                    error: { status: 'NOT_FOUND', message: 'models/gemini-does-not-exist is not found' }
                }
            }
        };

        const out = geminiProvider.normalizeError(err, { provider: 'gemini', model: 'gemini-does-not-exist' });

        assert(out instanceof LLMError);
        assert.strictEqual(out.kind, 'NotFoundModel');
        assert.strictEqual(out.provider, 'gemini');
        assert.strictEqual(out.status, 404);
        assert.strictEqual(out.providerCode, 'NOT_FOUND');
    });

    it('maps 400/INVALID_ARGUMENT to InvalidRequest by default', () => {
        const err = {
            response: {
                status: 400,
                data: { error: { status: 'INVALID_ARGUMENT', message: 'malformed request' } }
            }
        };

        const out = geminiProvider.normalizeError(err, { provider: 'gemini' });
        assert(out instanceof LLMError);
        assert.strictEqual(out.kind, 'InvalidRequest');
    });

    it('maps 400 INVALID_ARGUMENT with token-ish message to ContextTooLarge', () => {
        const err = {
            response: {
                status: 400,
                data: { error: { status: 'INVALID_ARGUMENT', message: 'maximum tokens exceeded' } }
            }
        };

        const out = geminiProvider.normalizeError(err, { provider: 'gemini' });
        assert(out instanceof LLMError);
        assert.strictEqual(out.kind, 'ContextTooLarge');
    });
});
