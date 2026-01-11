const assert = require('assert');
const proxyquire = require('proxyquire').noCallThru();

function makeFakeContext() {
    const globalState = new Map();
    return {
        globalState: {
            get: (k) => globalState.get(k),
            update: async (k, v) => {
                if (v === undefined) globalState.delete(k);
                else globalState.set(k, v);
            }
        },
        __debug: { globalState }
    };
}

describe('modelDiscovery.js', () => {
    it('uses static fallback when no api key and no cached entry', async () => {
        const context = makeFakeContext();

        const axios = { get: async () => { throw new Error('should not fetch'); } };
        const { getModels } = proxyquire('../../src/llm/modelDiscovery', {
            axios,
            './errors': { isCancellationError: () => false }
        });

        const entry = await getModels({
            providerId: 'openai',
            context,
            apiKey: null,
            staticFallback: [{ id: 'gpt-5.2', label: 'GPT-5.2' }]
        });

        assert(entry);
        assert.strictEqual(entry.source, 'static');
        assert.strictEqual(entry.items.length, 1);
    });

    it('caches remote results and returns cached when fresh', async () => {
        const context = makeFakeContext();
        let callCount = 0;

        const axios = {
            get: async () => {
                callCount++;
                return { data: { data: [{ id: 'gpt-5.2' }] } };
            }
        };

        const { getModels } = proxyquire('../../src/llm/modelDiscovery', {
            axios,
            './errors': { isCancellationError: () => false }
        });

        const first = await getModels({
            providerId: 'openai',
            context,
            apiKey: 'KEY',
            staticFallback: []
        });
        assert(first);
        assert.strictEqual(first.source, 'remote');
        assert.strictEqual(callCount, 1);

        const second = await getModels({
            providerId: 'openai',
            context,
            apiKey: 'KEY',
            staticFallback: []
        });
        assert(second);
        assert.strictEqual(callCount, 1); // should not refetch
    });

    it('Gemini paginates via nextPageToken', async () => {
        const context = makeFakeContext();

        const calls = [];
        const axios = {
            get: async (_url, opts) => {
                calls.push(opts?.params);
                // first page -> token
                if (!opts.params.pageToken) {
                    return {
                        data: {
                            models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }],
                            nextPageToken: 'T1'
                        }
                    };
                }
                // second page -> no token
                return {
                    data: {
                        models: [{ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }]
                    }
                };
            }
        };

        const { getModels } = proxyquire('../../src/llm/modelDiscovery', {
            axios,
            './errors': { isCancellationError: () => false }
        });

        const entry = await getModels({
            providerId: 'gemini',
            context,
            apiKey: 'KEY',
            staticFallback: []
        });

        assert(entry);
        assert.strictEqual(entry.items.length, 2);
        assert.strictEqual(calls.length, 2);
        assert.strictEqual(calls[0].pageToken, undefined);
        assert.strictEqual(calls[1].pageToken, 'T1');
    });

    it('Anthropic paginates via has_more + last_id', async () => {
        const context = makeFakeContext();

        const paramsSeen = [];
        const axios = {
            get: async (_url, opts) => {
                paramsSeen.push(opts.params);
                if (!opts.params.after_id) {
                    return {
                        data: {
                            data: [{ id: 'claude-sonnet-4-20250514' }],
                            has_more: true,
                            last_id: 'claude-sonnet-4-20250514'
                        }
                    };
                }
                return {
                    data: {
                        data: [{ id: 'claude-opus-4-20250514' }],
                        has_more: false,
                        last_id: 'claude-opus-4-20250514'
                    }
                };
            }
        };

        const { getModels } = proxyquire('../../src/llm/modelDiscovery', {
            axios,
            './errors': { isCancellationError: () => false }
        });

        const entry = await getModels({
            providerId: 'anthropic',
            context,
            apiKey: 'KEY',
            staticFallback: []
        });

        assert(entry);
        assert.strictEqual(entry.items.length, 2);
        assert.strictEqual(paramsSeen.length, 2);
        assert.strictEqual(paramsSeen[0].after_id, undefined);
        assert.strictEqual(paramsSeen[1].after_id, 'claude-sonnet-4-20250514');
    });
});
