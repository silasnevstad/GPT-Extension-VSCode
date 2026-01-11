/**
 * Lightweight text sizing helpers.
 */

const DEFAULT_TRUNCATION_MARKER = '\n...[TRUNCATED]...\n';

/**
 * @param {string} text
 * @param {number} maxChars
 * @param {{ marker?: string, headRatio?: number }} [opts]
 * @returns {{ text: string, truncated: boolean }}
 */
function truncateHeadTail(text, maxChars, opts = {}) {
    const marker = typeof opts.marker === 'string' ? opts.marker : DEFAULT_TRUNCATION_MARKER;
    const headRatio = typeof opts.headRatio === 'number' && Number.isFinite(opts.headRatio)
        ? Math.min(0.9, Math.max(0.1, opts.headRatio))
        : 0.5;

    if (typeof text !== 'string') return { text: '', truncated: false };
    if (!Number.isFinite(maxChars) || maxChars <= 0) return { text: '', truncated: true };
    if (text.length <= maxChars) return { text, truncated: false };

    const markerLen = marker.length;
    if (maxChars <= markerLen + 2) {
        // Not enough room for head/tail; return a hard cut.
        return { text: text.slice(0, maxChars), truncated: true };
    }

    const headLen = Math.max(1, Math.floor((maxChars - markerLen) * headRatio));
    const tailLen = Math.max(1, (maxChars - markerLen) - headLen);

    const head = text.slice(0, headLen);
    const tail = text.slice(text.length - tailLen);

    return { text: head + marker + tail, truncated: true };
}

/**
 * @param {string} system
 * @param {{ content: string }[]} messages
 * @returns {{ systemChars: number, messagesChars: number, totalChars: number }}
 */
function countRequestChars(system, messages) {
    const systemChars = typeof system === 'string' ? system.length : 0;
    let messagesChars = 0;
    for (const m of messages ?? []) {
        if (m && typeof m.content === 'string') messagesChars += m.content.length;
    }
    return { systemChars, messagesChars, totalChars: systemChars + messagesChars };
}

/**
 * Very rough heuristic; only for informational/debug counters.
 * @param {number} chars
 * @returns {number}
 */
function estimateTokensFromChars(chars) {
    if (!Number.isFinite(chars) || chars <= 0) return 0;
    // Common heuristic: ~4 chars per token for English.
    return Math.max(1, Math.ceil(chars / 4));
}

module.exports = {
    truncateHeadTail,
    countRequestChars,
    estimateTokensFromChars,
    DEFAULT_TRUNCATION_MARKER
};
