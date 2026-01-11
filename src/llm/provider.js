/**
 * Providers are responsible for:
 * - Making the HTTP request to the upstream API
 * - Returning normalized text output
 * - Normalizing upstream errors into LLMError taxonomy
 */

/**
 * @typedef {'user'|'assistant'} ChatRole
 */

/**
 * @typedef {{ role: ChatRole, content: string }} ChatMessage
 */

/**
 * @typedef {{
 *   apiKey: string,
 *   model: string,
 *   system?: string,
 *   messages: ChatMessage[],
 *   maxOutputTokens?: number,
 *   temperature?: number,
 *   topP?: number,
 *   signal?: AbortSignal,
 *   debug?: boolean
 * }} SendArgs
 */

/**
 * @typedef {{
 *   text: string,
 *   usage?: any,
 *   requestId?: string,
 *   status?: number
 * }} SendResult
 */

/**
 * @typedef {import('./errors').LLMError} LLMError
 */

/**
 * @typedef {{
 *   id: 'openai'|'anthropic'|'gemini',
 *   displayName: string,
 *   send: (args: SendArgs) => Promise<SendResult>,
 *   normalizeError: (err: any, ctx?: any) => LLMError
 * }} LLMProvider
 */

module.exports = {};
