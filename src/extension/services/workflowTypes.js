const WorkflowMode = Object.freeze({
    REPORT: 'report',
    EDIT: 'edit'
});

const OutputPolicy = Object.freeze({
    NEW_DOC: 'newDoc',
    REVIEW_APPLY: 'reviewApply',
    LEGACY: 'legacy'
});

module.exports = {WorkflowMode, OutputPolicy};