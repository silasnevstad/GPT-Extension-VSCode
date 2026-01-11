const assert = require('assert');
const proxyquire = require('proxyquire').noCallThru();

function makeVscodeMock() {
    const listeners = [];

    const workspace = {
        workspaceFolders: [],
        getConfiguration: () => ({
            get: (k, d) => d
        }),
        onDidChangeWorkspaceFolders: (cb) => { listeners.push(cb); return { dispose() {} }; },
        onDidChangeConfiguration: () => ({ dispose() {} }),
        createFileSystemWatcher: () => ({
            onDidCreate: () => ({ dispose() {} }),
            onDidChange: () => ({ dispose() {} }),
            onDidDelete: () => ({ dispose() {} }),
            dispose() {}
        }),
        fs: {
            stat: async () => ({ size: 0 }),
            readFile: async () => Buffer.from('')
        },
        getWorkspaceFolder: () => null
    };

    const window = {
        showWarningMessage: () => {}
    };

    class RelativePattern {
        constructor(_base, _pattern) {
            this.base = _base;
            this.pattern = _pattern;
        }
    }

    const Uri = {
        joinPath: (base, ...segs) => ({
            scheme: base.scheme,
            authority: base.authority,
            path: `${base.path}/${segs.join('/')}`.replace(/\/+/g, '/'),
            fsPath: `${base.fsPath}/${segs.join('/')}`,
            toString() { return `file://${this.path}`; }
        })
    };

    return { workspace, window, RelativePattern, Uri };
}

describe('projectInstructionManager.js', () => {
    it('normalizeInstruction strips BOM, normalizes newlines, trims trailing whitespace', () => {
        const vscode = makeVscodeMock();
        const { normalizeInstruction } = proxyquire('../../projectInstructionManager', { vscode });

        const input = '\uFEFFline1 \r\nline2\t\rline3  \n\n';
        const out = normalizeInstruction(input);
        assert.strictEqual(out, 'line1\nline2\nline3');
    });

    it('_ensureEntry normalizes missing/invalid version on existing entries', () => {
        const vscode = makeVscodeMock();
        const { ProjectInstructionManager } = proxyquire('../../projectInstructionManager', { vscode });

        const mgr = new ProjectInstructionManager({ logDebug: () => {}, warnUser: () => {} });

        const state = {
            folder: { uri: { toString: () => 'file:///w' } },
            cache: new Map()
        };

        state.cache.set('k', {
            loaded: true,
            exists: true,
            text: 'x',
            truncated: false,
            skippedTooLarge: false,
            outOfBounds: false,
            size: 1,
            refreshPromise: undefined
            // version missing
        });

        const entry = mgr._ensureEntry(state, 'k');
        assert.strictEqual(entry.version, 0);
        entry.version++;
        assert.strictEqual(entry.version, 1);
    });

    it('_onFileEvent(delete) increments version and clears entry fields', () => {
        const vscode = makeVscodeMock();
        const { ProjectInstructionManager } = proxyquire('../../projectInstructionManager', { vscode });

        const mgr = new ProjectInstructionManager({ logDebug: () => {}, warnUser: () => {} });

        const state = {
            folder: { uri: { toString: () => 'file:///w' } },
            cache: new Map()
        };

        const uri = { toString: () => 'k' };
        mgr._onFileEvent(state, uri, 'delete');

        const entry = state.cache.get('k');
        assert(entry);
        assert.strictEqual(entry.version, 1);
        assert.strictEqual(entry.loaded, true);
        assert.strictEqual(entry.exists, false);
        assert.strictEqual(entry.text, '');
        assert.strictEqual(entry.size, 0);
    });
});
