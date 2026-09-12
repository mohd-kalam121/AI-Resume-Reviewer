'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAnalyzeRequest } = require('../src/validate');

test('accepts a well-formed request and trims whitespace', () => {
    const result = validateAnalyzeRequest({ resume: '  hello  ', jobDescription: '  world  ' });
    assert.deepEqual(result, { resume: 'hello', jobDescription: 'world' });
});

test('rejects a missing resume', () => {
    assert.throws(() => validateAnalyzeRequest({ jobDescription: 'x' }), /resume.*required/i);
});

test('rejects a missing job description', () => {
    assert.throws(() => validateAnalyzeRequest({ resume: 'x' }), /jobDescription.*required/i);
});

test('rejects a blank (whitespace-only) resume', () => {
    assert.throws(() => validateAnalyzeRequest({ resume: '   ', jobDescription: 'x' }), /resume.*required/i);
});

test('rejects non-string input rather than coercing it', () => {
    assert.throws(() => validateAnalyzeRequest({ resume: 12345, jobDescription: 'x' }), /resume.*required/i);
});

test('rejects a field over the configured length limit', () => {
    const huge = 'a'.repeat(20_001);
    assert.throws(() => validateAnalyzeRequest({ resume: huge, jobDescription: 'x' }), /exceeds/i);
});

test('rejects a completely malformed body', () => {
    assert.throws(() => validateAnalyzeRequest(null), /resume.*required/i);
    assert.throws(() => validateAnalyzeRequest({}), /resume.*required/i);
});
