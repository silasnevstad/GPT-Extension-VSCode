const assert = require('assert');
const {
    LLMError,
    isLLMError,
    parseRetryAfterSec,
    extractRequestId,
    sanitizeForDebug,
    toUserMessage
} = require('../../src/llm/errors');

describe('errors.js', () => {
    describe('LLMError + isLLMError', () => {
        it('recognizes valid LLMError instances', () => {
            const e = new LLMError({ kind: 'Auth', provider: 'openai', message: 'x' });
            assert.strictEqual(isLLMError(e), true);
        });

        it('rejects non-LLMError shapes', () => {
            assert.strictEqual(isLLMError(new Error('x')), false);
            assert.strictEqual(isLLMError({ name: 'LLMError', kind: 'Nope' }), false);
        });
    });

    describe('parseRetryAfterSec', () => {
        it('parses numeric header', () => {
            assert.strictEqual(parseRetryAfterSec({ 'retry-after': 10 }), 10);
        });

        it('parses numeric string header', () => {
            assert.strictEqual(parseRetryAfterSec({ 'Retry-After': '7' }), 7);
        });

        it('parses RFC date header into delta seconds (non-negative)', () => {
            const future = new Date(Date.now() + 2500).toUTCString();
            const v = parseRetryAfterSec({ 'retry-after': future });
            assert(typeof v === 'number');
            assert(v >= 0);
        });

        it('returns undefined for missing/invalid', () => {
            assert.strictEqual(parseRetryAfterSec({}), undefined);
            assert.strictEqual(parseRetryAfterSec({ 'retry-after': 'nonsense' }), undefined);
        });
    });

    describe('extractRequestId', () => {
        it('extracts from common headers', () => {
            assert.strictEqual(extractRequestId({ 'x-request-id': 'abc' }), 'abc');
            assert.strictEqual(extractRequestId({ 'openai-request-id': 'xyz' }), 'xyz');
            assert.strictEqual(extractRequestId({}), undefined);
        });
    });

    describe('sanitizeForDebug', () => {
        it('redacts secrets by key name', () => {
            const out = sanitizeForDebug({
                Authorization: 'Bearer SECRET',
                'x-api-key': 'SECRET',
                'x-goog-api-key': 'SECRET',
                token: 'SECRET',
                password: 'SECRET',
                ok: 123
            });

            assert.strictEqual(out.Authorization, '[REDACTED]');
            assert.strictEqual(out['x-api-key'], '[REDACTED]');
            assert.strictEqual(out['x-goog-api-key'], '[REDACTED]');
            assert.strictEqual(out.token, '[REDACTED]');
            assert.strictEqual(out.password, '[REDACTED]');
            assert.strictEqual(out.ok, 123);
        });

        it('never emits header values', () => {
            const out = sanitizeForDebug({
                headers: { Authorization: 'Bearer SECRET', foo: 'bar' }
            });
            assert.deepStrictEqual(out.headers, { redacted: true, keys: ['Authorization', 'foo'] });
        });

        it('summarizes strings by default to avoid prompt leakage', () => {
            const out = sanitizeForDebug({ prompt: 'super secret prompt contents' });
            assert.strictEqual(out.prompt, `[string len=${'super secret prompt contents'.length}]`);
        });
    });

    describe('toUserMessage', () => {
        it('Auth message points to Manage API Keys', () => {
            const err = new LLMError({ kind: 'Auth', provider: 'openai', message: 'no' });
            const msg = toUserMessage(err, { providerLabel: 'OpenAI', model: 'gpt-5.2' });
            assert(msg.includes('OpenAI API key is missing or invalid.'));
            assert(msg.includes("GPT: Manage API Keys"));
        });

        it('NotFoundModel message points to Change Model', () => {
            const err = new LLMError({ kind: 'NotFoundModel', provider: 'openai', message: 'no' });
            const msg = toUserMessage(err, { providerLabel: 'OpenAI', model: 'bad-model' });
            assert(msg.includes('Model not available for OpenAI (bad-model).'));
            assert(msg.includes("GPT: Change Model"));
        });

        it('Anthropic overload special-case formats retry-after + request id', () => {
            const err = new LLMError({
                kind: 'Unknown',
                provider: 'anthropic',
                status: 529,
                retryAfterSec: 3,
                requestId: 'req-1',
                message: 'overload'
            });
            const msg = toUserMessage(err, { providerLabel: 'Anthropic', model: 'claude' });
            assert(msg.includes('Anthropic is temporarily overloaded.'));
            assert(msg.includes('Retry after ~3s.'));
            assert(msg.includes('Request ID: req-1'));
        });
    });
});
