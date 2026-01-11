const assert = require('assert');
const sinon = require('sinon');

const { LLMRouter } = require('../../src/llm/router');
const { LLMError } = require('../../src/llm/errors');

function makeFakeVscode(initialConfig = {}) {
    const store = {
        provider: initialConfig.provider ?? 'openai',
        'openai.model': initialConfig['openai.model'] ?? 'gpt-5.2',
        'anthropic.model': initialConfig['anthropic.model'] ?? 'claude-sonnet-4-5-20250929',
        'gemini.model': initialConfig['gemini.model'] ?? 'gemini-2.5-flash',
        maxOutputTokens: initialConfig.maxOutputTokens ?? 0
    };

    return {
        ConfigurationTarget: { Global: 1 },
        workspace: {
            getConfiguration: () => ({
                get: (k, d) => (k in store ? store[k] : d),
                update: async (k, v) => {
                    store[k] = v;
                }
            })
        }
    };
}

function makeFakeContext() {
    const secrets = new Map();
    const globalState = new Map();

    return {
        secrets: {
            get: async (k) => secrets.get(k),
            store: async (k, v) => secrets.set(k, v),
            delete: async (k) => secrets.delete(k)
        },
        globalState: {
            get: (k) => globalState.get(k),
            update: async (k, v) => {
                if (v === undefined) globalState.delete(k);
                else globalState.set(k, v);
            }
        },
        __debug: { secrets, globalState }
    };
}

describe('router.js (LLMRouter)', () => {
    it('defaults to openai when config provider is invalid', () => {
        const vscode = makeFakeVscode({ provider: 'nope' });
        const context = makeFakeContext();
        const router = new LLMRouter({ vscode, context });

        assert.strictEqual(router.getActiveProviderId(), 'openai');
    });

    it('getApiKey migrates legacy openai key from globalState to secrets', async () => {
        const vscode = makeFakeVscode({ provider: 'openai' });
        const context = makeFakeContext();
        context.__debug.globalState.set('openaiApiKey', 'LEGACY');

        const router = new LLMRouter({ vscode, context });

        const key = await router.getApiKey('openai');
        assert.strictEqual(key, 'LEGACY');
        assert.strictEqual(context.__debug.secrets.get('openaiApiKey'), 'LEGACY');
        assert.strictEqual(context.__debug.globalState.get('openaiApiKey'), undefined);
    });

    it('setApiKey stores in secrets and clears legacy globalState key', async () => {
        const vscode = makeFakeVscode({ provider: 'openai' });
        const context = makeFakeContext();
        context.__debug.globalState.set('openaiApiKey', 'LEGACY');

        const router = new LLMRouter({ vscode, context });

        const res = await router.setApiKey('openai', 'NEWKEY');
        assert.strictEqual(res.persisted, true);
        assert.strictEqual(context.__debug.secrets.get('openaiApiKey'), 'NEWKEY');
        assert.strictEqual(context.__debug.globalState.get('openaiApiKey'), undefined);
    });

    it('setApiKey rejects empty keys', async () => {
        const vscode = makeFakeVscode();
        const context = makeFakeContext();
        const router = new LLMRouter({ vscode, context });

        await assert.rejects(
            () => router.setApiKey('openai', '   '),
            (e) => e instanceof Error && e.name === 'LLMError'
        );
    });

    it('resolve max output tokens: openai clamps to known max when setting exceeds it', () => {
        const vscode = makeFakeVscode({ provider: 'openai', maxOutputTokens: 999999 });
        const context = makeFakeContext();
        const router = new LLMRouter({ vscode, context });

        const model = 'gpt-4-turbo'; // known max 4096
        const out = router._resolveMaxOutputTokens('openai', model, 999999);
        assert.strictEqual(out.resolved, 4096);
        assert.strictEqual(out.clampedFrom, 999999);
    });

    it('resolve max output tokens: anthropic uses 1024 when setting is 0', () => {
        const vscode = makeFakeVscode({ provider: 'anthropic', maxOutputTokens: 0 });
        const context = makeFakeContext();
        const router = new LLMRouter({ vscode, context });

        const out = router._resolveMaxOutputTokens('anthropic', 'claude', 0);
        assert.strictEqual(out.resolved, 1024);
    });

    it('selectHistory isolates by provider and drops leading assistant', () => {
        const vscode = makeFakeVscode({ provider: 'openai' });
        const context = makeFakeContext();
        const router = new LLMRouter({ vscode, context });

        const history = [
            { role: 'assistant', content: 'a0', provider: 'openai' },
            { role: 'user', content: 'u0', provider: 'openai' },
            { role: 'assistant', content: 'a1', provider: 'anthropic' },
            { role: 'user', content: 'u1', provider: 'openai' }
        ];

        const res = router._selectHistory(history, 'openai', 'full', 999);
        assert.strictEqual(res.droppedLeading, 1);
        assert.deepStrictEqual(res.messages.map(m => m.content), ['u0', 'u1']);
    });

    it('send throws Auth when no API key is present', async () => {
        const vscode = makeFakeVscode({ provider: 'openai' });
        const context = makeFakeContext();

        const fakeProvider = {
            id: 'openai',
            displayName: 'OpenAI',
            send: async () => ({ text: 'x' }),
            normalizeError: (err) => err
        };

        const router = new LLMRouter({
            vscode,
            context,
            providers: { openai: fakeProvider, anthropic: fakeProvider, gemini: fakeProvider }
        });

        await assert.rejects(
            () => router.send({
                userPrompt: 'hi',
                history: [],
                contextMode: 'none',
                contextLength: 0
            }),
            (e) => e instanceof LLMError && e.kind === 'Auth'
        );
    });

    it('send returns null on cancellation', async () => {
        const vscode = makeFakeVscode({ provider: 'openai' });
        const context = makeFakeContext();
        await context.secrets.store('openaiApiKey', 'KEY');

        const fakeProvider = {
            id: 'openai',
            displayName: 'OpenAI',
            send: async () => {
                const err = new Error('Canceled');
                err.code = 'ERR_CANCELED';
                throw err;
            },
            normalizeError: () => new LLMError({ kind: 'Unknown', provider: 'openai', message: 'x' })
        };

        const router = new LLMRouter({
            vscode,
            context,
            providers: { openai: fakeProvider, anthropic: fakeProvider, gemini: fakeProvider }
        });

        const res = await router.send({
            userPrompt: 'hi',
            history: [],
            contextMode: 'none',
            contextLength: 0
        });

        assert.strictEqual(res, null);
    });

    it('ContextTooLarge triggers a single retry with reduced payload', async () => {
        const vscode = makeFakeVscode({ provider: 'openai' });
        const context = makeFakeContext();
        await context.secrets.store('openaiApiKey', 'KEY');

        const sendStub = sinon.stub();
        sendStub.onCall(0).throws(new LLMError({ kind: 'ContextTooLarge', provider: 'openai', message: 'too big' }));
        sendStub.onCall(1).resolves({ text: 'ok', requestId: 'r1', usage: {} });

        const fakeProvider = {
            id: 'openai',
            displayName: 'OpenAI',
            send: sendStub,
            normalizeError: (e) => e
        };

        const router = new LLMRouter({
            vscode,
            context,
            providers: { openai: fakeProvider, anthropic: fakeProvider, gemini: fakeProvider },
            logDebug: () => {},
            warnUser: () => {}
        });

        const longPrompt = 'x'.repeat(300000);
        const res = await router.send({
            userPrompt: longPrompt,
            history: [{ role: 'user', content: 'h', provider: 'openai' }],
            contextMode: 'full',
            contextLength: 999
        });

        assert(res);
        assert.strictEqual(res.text, 'ok');
        assert.strictEqual(sendStub.callCount, 2);

        // Ensure retry used truncated user content (second call)
        const secondArgs = sendStub.getCall(1).args[0];
        const lastMsg = secondArgs.messages[secondArgs.messages.length - 1];
        assert.strictEqual(lastMsg.role, 'user');
        assert(lastMsg.content.length <= 200000 + 1000); // allow marker overhead
    });
});
