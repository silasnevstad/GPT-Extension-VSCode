const assert = require('assert');
const {WorkflowMode, OutputPolicy} = require('../../src/extension/services/workflowTypes');

describe('workflowTypes', () => {
    it('exports workflow mode constants', () => {
        assert.deepStrictEqual(WorkflowMode, {
            REPORT: 'report',
            EDIT: 'edit'
        });
    });

    it('exports output policy constants', () => {
        assert.deepStrictEqual(OutputPolicy, {
            NEW_DOC: 'newDoc',
            REVIEW_APPLY: 'reviewApply',
            LEGACY: 'legacy'
        });
    });
});