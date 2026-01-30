function safeErrorDetails(err) {
    return {
        name: typeof err?.name === 'string' ? err.name : 'Error',
        code: typeof err?.code === 'string' ? err.code : undefined
    };
}

module.exports = {safeErrorDetails};