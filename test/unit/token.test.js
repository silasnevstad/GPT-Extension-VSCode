const assert = require('assert');
const {
    truncateHeadTail,
    countRequestChars,
    estimateTokensFromChars,
    DEFAULT_TRUNCATION_MARKER
} = require('../../src/llm/token');

describe('token.js', () => {
    describe('truncateHeadTail', () => {
        it('returns original text when within limit', () => {
            const input = 'hello';
            const res = truncateHeadTail(input, 10);
            assert.strictEqual(res.truncated, false);
            assert.strictEqual(res.text, input);
        });

        it('truncates long text and includes marker', () => {
            const input = 'a'.repeat(1000);
            const res = truncateHeadTail(input, 100);
            assert.strictEqual(res.truncated, true);
            assert(res.text.length <= 100);
            assert(res.text.includes(DEFAULT_TRUNCATION_MARKER.trim()));
        });

        it('hard-cuts when maxChars too small for marker+head+tail', () => {
            const input = 'a'.repeat(100);
            const res = truncateHeadTail(input, 5, { marker: '...[T]...' }); // marker longer than max
            assert.strictEqual(res.truncated, true);
            assert.strictEqual(res.text.length, 5);
        });

        it('handles non-string input as empty', () => {
            const res = truncateHeadTail(/** @type {any} */ (null), 10);
            assert.strictEqual(res.truncated, false);
            assert.strictEqual(res.text, '');
        });

        it('treats non-positive maxChars as truncation', () => {
            const res = truncateHeadTail('hello', 0);
            assert.strictEqual(res.truncated, true);
            assert.strictEqual(res.text, '');
        });
    });

    describe('countRequestChars', () => {
        it('counts system + message chars', () => {
            const res = countRequestChars('sys', [{ content: 'abc' }, { content: 'de' }]);
            assert.deepStrictEqual(res, { systemChars: 3, messagesChars: 5, totalChars: 8 });
        });

        it('ignores missing/invalid message shapes safely', () => {
            const res = countRequestChars('sys', /** @type {any} */ ([{}, { content: 123 }, null]));
            assert.deepStrictEqual(res, { systemChars: 3, messagesChars: 0, totalChars: 3 });
        });
    });

    describe('estimateTokensFromChars', () => {
        it('returns 0 for non-positive', () => {
            assert.strictEqual(estimateTokensFromChars(0), 0);
            assert.strictEqual(estimateTokensFromChars(-1), 0);
        });

        it('uses ~4 chars/token heuristic', () => {
            assert.strictEqual(estimateTokensFromChars(1), 1);
            assert.strictEqual(estimateTokensFromChars(4), 1);
            assert.strictEqual(estimateTokensFromChars(5), 2);
            assert.strictEqual(estimateTokensFromChars(8), 2);
        });
    });
});
