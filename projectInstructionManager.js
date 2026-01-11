// projectInstructionManager.js
// Per-workspace-folder `.gpt-instruction` loader with caching + watcher invalidation.
// - Multi-root aware (per WorkspaceFolder)
// - Async I/O (no sync FS on extension host thread)
// - Max size enforcement w/ truncation warning
// - Normalizes line endings + trims trailing whitespace
// - Never reads outside workspace boundaries (guards symlink/path escape for file: URIs)
// - Never logs or prompts with file paths (only uses internal keys)

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const INSTRUCTION_FILE_NAME = '.gpt-instruction';

// Default max bytes included in prompts.
// Keep reasonably small; users can raise it via configuration.
const DEFAULT_MAX_BYTES = 64 * 1024; // 64KiB
const MIN_MAX_BYTES = 1024; // 1KiB minimum to avoid degenerate configs
const ABSOLUTE_MAX_BYTES = 16 * 1024 * 1024; // 16MiB hard safety cap (absolute upper bound)

// For non-file schemes, vscode.workspace.fs.readFile reads the entire file.
// Enforce a hard ceiling to avoid large allocations in remote/virtual workspaces.
const DEFAULT_HARD_READ_BYTES = 1024 * 1024; // 1MiB

/**
 * @typedef {'workspaceRoot'|'nearestParent'} LookupMode
 */

/**
 * @typedef {{
 *   enabled: boolean,
 *   lookup: LookupMode,
 *   maxBytes: number
 * }} ProjectInstructionConfig
 */

/**
 * @typedef {{
 *   loaded: boolean,
 *   exists: boolean,
 *   text: string,
 *   truncated: boolean,
 *   skippedTooLarge: boolean,
 *   outOfBounds: boolean,
 *   size: number,
 *   version: number,
 *   refreshPromise?: Promise<void>
 * }} CacheEntry
 */

function readConfig() {
    const cfg = vscode.workspace.getConfiguration('gpthelper');

    /** @type {boolean} */
    const enabled = cfg.get('projectInstruction.enabled', true);

    const lookupRaw = cfg.get('projectInstruction.lookup', 'workspaceRoot');
    /** @type {LookupMode} */
    const lookup = lookupRaw === 'nearestParent' ? 'nearestParent' : 'workspaceRoot';

    const maxBytesRaw = cfg.get('projectInstruction.maxBytes', DEFAULT_MAX_BYTES);
    const maxBytesNum = typeof maxBytesRaw === 'number' && Number.isFinite(maxBytesRaw)
        ? Math.floor(maxBytesRaw)
        : DEFAULT_MAX_BYTES;

    const maxBytes = Math.min(ABSOLUTE_MAX_BYTES, Math.max(MIN_MAX_BYTES, maxBytesNum));

    return {enabled, lookup, maxBytes};
}

function isFileNotFoundError(err) {
    const code = /** @type {any} */ (err)?.code;
    return code === 'FileNotFound' || code === 'ENOENT';
}

function safeErrorDetails(err) {
    // Intentionally exclude err.message because it often includes filesystem paths.
    return {
        name: typeof err?.name === 'string' ? err.name : 'Error',
        code: typeof err?.code === 'string' ? err.code : undefined
    };
}

/**
 * Normalize instruction content:
 * - strip UTF-8 BOM
 * - normalize \r\n/\r to \n
 * - trim trailing whitespace per line
 * - trim trailing whitespace/newlines at EOF
 * @param {string} raw
 * @returns {string}
 */
function normalizeInstruction(raw) {
    if (!raw) return '';

    let s = raw;

    // Strip UTF-8 BOM
    if (s.length > 0 && s.charCodeAt(0) === 0xFEFF) {
        s = s.slice(1);
    }

    // Normalize line endings to \n
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Trim trailing whitespace per line, preserve leading whitespace
    s = s
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n');

    // Trim trailing whitespace/newlines at EOF
    s = s.trimEnd();

    return s;
}

/**
 * Ensure `fileUri` resolves within `workspaceFolderUri` for file: URIs (symlink/path escape guard).
 * Returns false if realpath resolves outside.
 * @param {vscode.Uri} fileUri
 * @param {vscode.Uri} workspaceFolderUri
 * @returns {Promise<boolean>}
 */
async function realpathIsWithinWorkspaceFolder(fileUri, workspaceFolderUri) {
    if (fileUri.scheme !== 'file' || workspaceFolderUri.scheme !== 'file') return true;

    try {
        const [folderReal, fileReal] = await Promise.all([
            fs.promises.realpath(workspaceFolderUri.fsPath),
            fs.promises.realpath(fileUri.fsPath)
        ]);

        const rel = path.relative(folderReal, fileReal);
        if (rel === '') return true;

        // Out of bounds if rel is .. or starts with ../ (platform-specific sep), or is absolute.
        if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return false;

        return true;
    } catch (err) {
        // If the target doesn't exist, upstream stat/read will treat it as missing.
        if (isFileNotFoundError(err)) return true;
        // If verification fails, treat as out-of-bounds.
        return false;
    }
}

/**
 * Read up to `bytesToRead` bytes from a local file path.
 * @param {string} fsPath
 * @param {number} bytesToRead
 * @returns {Promise<Buffer>}
 * Instruction file handling rules:
 * - Ignored or unreadable files are skipped during lookup.
 * - Readable empty files explicitly override parent instructions.
 * - Warning flags are emitted once when applicable.
 */
async function readFirstBytesFromDisk(fsPath, bytesToRead) {
    if (bytesToRead <= 0) return Buffer.alloc(0);

    /** @type {fs.promises.FileHandle | undefined} */
    let fh;
    try {
        fh = await fs.promises.open(fsPath, 'r');
        const buf = Buffer.alloc(bytesToRead);
        const res = await fh.read(buf, 0, bytesToRead, 0);
        return res.bytesRead === bytesToRead ? buf : buf.slice(0, res.bytesRead);
    } finally {
        try {
            await fh?.close();
        } catch { /* ignore */
        }
    }
}

/**
 * @param {vscode.Uri} instructionUri
 * @param {vscode.WorkspaceFolder} folder
 * @param {ProjectInstructionConfig} config
 * @param {(msg: string, details?: any) => void} logDebug
 * @returns {Promise<{ exists: boolean, text: string, truncated: boolean, skippedTooLarge: boolean, outOfBounds: boolean, size: number }>}
 */
async function readInstructionFile(instructionUri, folder, config, logDebug) {
    if (!config.enabled) {
        return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: false, size: 0};
    }

    // Enforce workspace-folder boundary by URI path (realpath guard handles symlinks).
    if (instructionUri.scheme !== folder.uri.scheme || instructionUri.authority !== folder.uri.authority) {
        return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: true, size: 0};
    }
    const rel = path.posix.relative(folder.uri.path, instructionUri.path);
    if (rel.startsWith('..') || path.posix.isAbsolute(rel)) {
        return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: true, size: 0};
    }

    /** @type {vscode.FileStat | undefined} */
    let stat;
    try {
        stat = await vscode.workspace.fs.stat(instructionUri);
    } catch (err) {
        if (isFileNotFoundError(err)) {
            return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: false, size: 0};
        }
        logDebug('ProjectInstruction: stat failed', safeErrorDetails(err));
        return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: false, size: 0};
    }

    const size = typeof stat.size === 'number' ? stat.size : 0;
    const maxBytes = Math.min(config.maxBytes, ABSOLUTE_MAX_BYTES);

    // file: symlink/path escape protection
    const within = await realpathIsWithinWorkspaceFolder(instructionUri, folder.uri);
    if (!within) {
        // Treat as not found.
        return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: true, size};
    }

    const truncated = size > maxBytes;

    // For non-file schemes, avoid reading extremely large files because readFile is all-or-nothing.
    if (instructionUri.scheme !== 'file') {
        const hardMax = Math.min(
            ABSOLUTE_MAX_BYTES,
            Math.max(DEFAULT_HARD_READ_BYTES, maxBytes * 2)
        );

        if (size > hardMax) {
            // Treat as not found.
            return {exists: false, text: '', truncated: false, skippedTooLarge: true, outOfBounds: false, size};
        }

        try {
            const bytes = await vscode.workspace.fs.readFile(instructionUri);
            const slice = truncated ? bytes.subarray(0, maxBytes) : bytes;
            const text = normalizeInstruction(Buffer.from(slice).toString('utf8'));
            return {exists: true, text, truncated, skippedTooLarge: false, outOfBounds: false, size};
        } catch (err) {
            if (isFileNotFoundError(err)) {
                return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: false, size: 0};
            }
            logDebug('ProjectInstruction: read failed', safeErrorDetails(err));
            // Unreadable: treat as not found
            return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: false, size};
        }
    }

    // file: scheme — partial read to avoid allocating huge buffers.
    try {
        const bytesToRead = Math.min(size, maxBytes);
        const buf = await readFirstBytesFromDisk(instructionUri.fsPath, bytesToRead);
        const text = normalizeInstruction(buf.toString('utf8'));
        return {exists: true, text, truncated, skippedTooLarge: false, outOfBounds: false, size};
    } catch (err) {
        if (isFileNotFoundError(err)) {
            return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: false, size: 0};
        }
        logDebug('ProjectInstruction: disk read failed', safeErrorDetails(err));
        // Unreadable => treat as not found.
        return {exists: false, text: '', truncated: false, skippedTooLarge: false, outOfBounds: false, size};
    }
}

class ProjectInstructionManager {
    /**
     * @param {{
     *   logDebug?: (msg: string, details?: any) => void,
     *   warnUser?: (msg: string) => void
     * }} [opts]
     */
    constructor(opts = {}) {
        /** @type {(msg: string, details?: any) => void} */
        this._logDebug = typeof opts.logDebug === 'function' ? opts.logDebug : () => {
        };
        /** @type {(msg: string) => void} */
        this._warnUser = typeof opts.warnUser === 'function' ? opts.warnUser : (msg) => vscode.window.showWarningMessage(msg);

        /** @type {ProjectInstructionConfig} */
        this._config = readConfig();

        /** @type {Set<string>} */
        this._warnedOnce = new Set();

        /**
         * workspaceFolderUriString -> folder state
         * @type {Map<string, { folder: vscode.WorkspaceFolder, disposables: vscode.Disposable[], cache: Map<string, CacheEntry> }>}
         */
        this._states = new Map();

        /** @type {vscode.Disposable[]} */
        this._disposables = [];
    }

    initialize() {
        // Initial folders
        const folders = vscode.workspace.workspaceFolders ?? [];
        for (const folder of folders) this._addFolder(folder);

        // Workspace folder changes
        this._disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(e => {
                for (const removed of e.removed) this._removeFolder(removed);
                for (const added of e.added) this._addFolder(added);
            })
        );

        // Configuration changes
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (!e.affectsConfiguration('gpthelper.projectInstruction')) return;

                const next = readConfig();
                const changed =
                    next.enabled !== this._config.enabled ||
                    next.lookup !== this._config.lookup ||
                    next.maxBytes !== this._config.maxBytes;

                this._config = next;
                if (!changed) return;

                // Clear warnings and caches; rebuild watchers deterministically.
                this._warnedOnce.clear();
                for (const state of this._states.values()) {
                    state.cache.clear();
                    this._rebuildWatcher(state);
                }
            })
        );
    }

    dispose() {
        for (const state of this._states.values()) {
            for (const d of state.disposables) {
                try {
                    d.dispose();
                } catch { /* ignore */
                }
            }
        }
        this._states.clear();

        for (const d of this._disposables) {
            try {
                d.dispose();
            } catch { /* ignore */
            }
        }
        this._disposables = [];
    }

    /**
     * Returns the applicable `.gpt-instruction` contents for the given document/URI.
     * Multi-root: resolves via vscode.workspace.getWorkspaceFolder(uri). If none, returns ''.
     * @param {vscode.TextDocument | vscode.Uri} docOrUri
     * @returns {Promise<string>}
     */
    async getInstruction(docOrUri) {
        if (!this._config.enabled) return '';

        const uri = docOrUri instanceof vscode.Uri ? docOrUri : docOrUri.uri;
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) return '';

        const state = this._states.get(folder.uri.toString());
        if (!state) return '';

        if (this._config.lookup === 'workspaceRoot') {
            const instructionUri = vscode.Uri.joinPath(folder.uri, INSTRUCTION_FILE_NAME);
            const entry = await this._getOrLoadEntry(state, instructionUri);
            return entry.exists ? entry.text : '';
        }

        // nearestParent: walk up from file directory to workspace root; nearest existing file wins.
        const relToFolder = path.posix.relative(folder.uri.path, uri.path);
        if (relToFolder.startsWith('..') || path.posix.isAbsolute(relToFolder)) return '';

        const docDirRel = path.posix.dirname(relToFolder);
        let curDirRel = docDirRel === '.' ? '' : docDirRel;

        while (true) {
            const instructionUri = curDirRel
                ? vscode.Uri.joinPath(folder.uri, ...curDirRel.split('/'), INSTRUCTION_FILE_NAME)
                : vscode.Uri.joinPath(folder.uri, INSTRUCTION_FILE_NAME);

            const entry = await this._getOrLoadEntry(state, instructionUri);
            if (entry.exists) {
                // Nearest existing file wins, even if empty (explicit override).
                return entry.text;
            }

            if (!curDirRel) break;
            const parent = path.posix.dirname(curDirRel);
            curDirRel = parent === '.' ? '' : parent;
        }

        return '';
    }

    /**
     * @param {vscode.WorkspaceFolder} folder
     */
    _addFolder(folder) {
        const key = folder.uri.toString();
        if (this._states.has(key)) return;

        const state = {
            folder,
            disposables: [],
            cache: new Map()
        };

        this._states.set(key, state);
        this._rebuildWatcher(state);
    }

    /**
     * @param {vscode.WorkspaceFolder} folder
     */
    _removeFolder(folder) {
        const key = folder.uri.toString();
        const state = this._states.get(key);
        if (!state) return;

        for (const d of state.disposables) {
            try {
                d.dispose();
            } catch { /* ignore */
            }
        }
        this._states.delete(key);
    }

    /**
     * @param {{ folder: vscode.WorkspaceFolder, disposables: vscode.Disposable[], cache: Map<string, CacheEntry> }} state
     */
    _rebuildWatcher(state) {
        // Dispose existing watcher/listeners
        for (const d of state.disposables) {
            try {
                d.dispose();
            } catch { /* ignore */
            }
        }
        state.disposables = [];

        if (!this._config.enabled) {
            state.cache.clear();
            return;
        }

        const pattern = this._config.lookup === 'nearestParent'
            ? new vscode.RelativePattern(state.folder, `**/${INSTRUCTION_FILE_NAME}`)
            : new vscode.RelativePattern(state.folder, INSTRUCTION_FILE_NAME);

        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        const onCreate = watcher.onDidCreate(uri => this._onFileEvent(state, uri, 'create'));
        const onChange = watcher.onDidChange(uri => this._onFileEvent(state, uri, 'change'));
        const onDelete = watcher.onDidDelete(uri => this._onFileEvent(state, uri, 'delete'));

        state.disposables.push(watcher, onCreate, onChange, onDelete);
    }

    /**
     * @param {{ folder: vscode.WorkspaceFolder, cache: Map<string, CacheEntry> }} state
     * @param {vscode.Uri} uri
     * @param {'create'|'change'|'delete'} kind
     */
    _onFileEvent(state, uri, kind) {
        const key = uri.toString();

        if (kind === 'delete') {
            const entry = this._ensureEntry(state, key);

            entry.version++;
            entry.loaded = true;
            entry.exists = false;
            entry.text = '';
            entry.truncated = false;
            entry.skippedTooLarge = false;
            entry.outOfBounds = false;
            entry.size = 0;
            entry.refreshPromise = undefined;

            this._logDebug('ProjectInstruction: cleared', {present: false});
            return;
        }

        // create/change: refresh in background
        void this._refresh(state, uri);
    }

    /**
     * @param {{ cache: Map<string, CacheEntry> }} state
     * @param {string} key
     * @returns {CacheEntry}
     */
    _ensureEntry(state, key) {
        const existing = state.cache.get(key);
        if (existing) {
            // Normalization for older/partial entries.
            if (typeof existing.version !== 'number' || !Number.isFinite(existing.version)) {
                existing.version = 0;
            }
            return existing;
        }

        /** @type {CacheEntry} */
        const entry = {
            loaded: false,
            exists: false,
            text: '',
            truncated: false,
            skippedTooLarge: false,
            outOfBounds: false,
            size: 0,
            refreshPromise: undefined,
            version: 0
        };

        state.cache.set(key, entry);
        return entry;
    }

    /**
     * @param {{ folder: vscode.WorkspaceFolder, cache: Map<string, CacheEntry> }} state
     * @param {vscode.Uri} uri
     * @returns {Promise<CacheEntry>}
     */
    async _getOrLoadEntry(state, uri) {
        const key = uri.toString();
        const entry = this._ensureEntry(state, key);

        if (!entry.loaded) {
            await this._refresh(state, uri);
        } else if (entry.refreshPromise) {
            await entry.refreshPromise;
        }

        return entry;
    }

    /**
     * Serialized refresh per entry to avoid duplicate reads/races.
     * @param {{ folder: vscode.WorkspaceFolder, cache: Map<string, CacheEntry> }} state
     * @param {vscode.Uri} uri
     * @returns {Promise<void>}
     */
    _refresh(state, uri) {
        const key = uri.toString();
        const entry = this._ensureEntry(state, key);

        const prev = entry.refreshPromise ?? Promise.resolve();
        const startVersion = entry.version;

        entry.refreshPromise = prev
            .then(async () => {
                const res = await readInstructionFile(uri, state.folder, this._config, this._logDebug);

                // drop stale refresh
                if (entry.version !== startVersion) return;

                entry.loaded = true;
                entry.exists = res.exists;
                entry.text = res.text;
                entry.truncated = res.truncated;
                entry.skippedTooLarge = res.skippedTooLarge;
                entry.outOfBounds = res.outOfBounds;
                entry.size = res.size;

                // User-facing warnings: never include paths.
                if (res.outOfBounds) {
                    this._warnOnce(`oob:${key}`, '`.gpt-instruction` resolves outside the workspace folder and was ignored for safety.');
                } else if (res.skippedTooLarge) {
                    this._warnOnce(
                        `skip:${key}`,
                        '`.gpt-instruction` is too large to read safely in this workspace; it was ignored. Reduce its size or lower the configured max.'
                    );
                } else if (res.truncated) {
                    this._warnOnce(
                        `trunc:${key}:${this._config.maxBytes}`,
                        '`.gpt-instruction` exceeded the configured maximum size and was truncated.'
                    );
                }

                this._logDebug('ProjectInstruction: updated', {
                    present: entry.exists && entry.text.length > 0,
                    exists: entry.exists,
                    truncated: entry.truncated,
                    skippedTooLarge: entry.skippedTooLarge,
                    outOfBounds: entry.outOfBounds,
                    sizeBytes: entry.size,
                    usedMaxBytes: this._config.maxBytes
                });
            })
            .catch(err => {
                this._logDebug('ProjectInstruction: refresh failed', safeErrorDetails(err));
            });

        return entry.refreshPromise;
    }

    /**
     * @param {string} key
     * @param {string} msg
     */
    _warnOnce(key, msg) {
        if (this._warnedOnce.has(key)) return;
        this._warnedOnce.add(key);
        this._warnUser(msg);
    }
}

module.exports = {
    ProjectInstructionManager,
    normalizeInstruction
};
