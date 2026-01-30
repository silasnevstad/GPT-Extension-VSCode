function formatChatHistory(chatHistory) {
    const providerLabel = (p) => (p === 'anthropic' ? 'Anthropic' : p === 'gemini' ? 'Gemini' : 'OpenAI');
    return chatHistory
        .map(msg => {
            const timeStr = new Date(msg.timestamp).toLocaleTimeString();
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            const provider = providerLabel(typeof msg.provider === 'string' ? msg.provider : 'openai');
            const model = typeof msg.model === 'string' ? msg.model : 'unknown-model';
            return `${'='.repeat(10)}\n**${role} (${provider}/${model}) [${timeStr}]:**\n${msg.content}\n${'='.repeat(10)}\n`;
        })
        .join('\n');
}

module.exports = {formatChatHistory};