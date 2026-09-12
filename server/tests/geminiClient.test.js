'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GeminiClient, normalizeAnalysis, buildPrompt } = require('../src/geminiClient');

function jsonOf(obj) {
    return { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] };
}
function response(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function stubFetch(sequence) {
    const calls = [];
    const queue = [...sequence];
    const impl = async (url, options) => {
        calls.push({ url, options });
        const next = queue.length > 1 ? queue.shift() : queue[0];
        return typeof next === 'function' ? next() : next;
    };
    impl.calls = calls;
    return impl;
}
const noSleep = async () => {};

test('analyzeResumeMatch parses a well-formed schema response', async () => {
    const fetchImpl = stubFetch([response(jsonOf({ matchScore: 72, missingKeywords: ['Docker'], suggestions: ['Add a Docker project'] }))]);
    const client = new GeminiClient({ apiKey: 'test-key', fetchImpl, sleep: noSleep });

    const result = await client.analyzeResumeMatch('my resume', 'the jd');
    assert.deepEqual(result, { matchScore: 72, missingKeywords: ['Docker'], suggestions: ['Add a Docker project'] });
});

test('a transient 503 is retried and then succeeds', async () => {
    const fetchImpl = stubFetch([
        response({}, 503),
        response({}, 503),
        response(jsonOf({ matchScore: 50, missingKeywords: [], suggestions: [] }))
    ]);
    const client = new GeminiClient({ apiKey: 'test-key', fetchImpl, sleep: noSleep });

    const result = await client.analyzeResumeMatch('r', 'jd');
    assert.equal(result.matchScore, 50);
    assert.equal(fetchImpl.calls.length, 3);
});

test('a 400 (bad request) is not retried', async () => {
    const fetchImpl = stubFetch([response({}, 400)]);
    const client = new GeminiClient({ apiKey: 'test-key', fetchImpl, sleep: noSleep, maxRetries: 3 });

    await assert.rejects(() => client.analyzeResumeMatch('r', 'jd'), /400/);
    assert.equal(fetchImpl.calls.length, 1);
});

test('retries are bounded and the final error propagates', async () => {
    const fetchImpl = stubFetch([response({}, 503)]);
    const client = new GeminiClient({ apiKey: 'test-key', fetchImpl, sleep: noSleep, maxRetries: 2 });

    // An exhausted 503 should still tell the caller that retrying is worthwhile.
    await assert.rejects(() => client.analyzeResumeMatch('r', 'jd'), /busy right now/);
    assert.equal(fetchImpl.calls.length, 3); // initial + 2 retries
});

test('a hung request is aborted and reported as a timeout', async () => {
    const fetchImpl = (url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const client = new GeminiClient({ apiKey: 'test-key', fetchImpl, sleep: noSleep, timeoutMs: 20, maxRetries: 0 });

    await assert.rejects(() => client.analyzeResumeMatch('r', 'jd'), /timed out/);
});

test('missing content in the response is reported clearly', async () => {
    const fetchImpl = stubFetch([response({ candidates: [] })]);
    const client = new GeminiClient({ apiKey: 'test-key', fetchImpl, sleep: noSleep });

    await assert.rejects(() => client.analyzeResumeMatch('r', 'jd'), /no content/i);
});

test('a missing API key fails fast without making a network call', async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return response(jsonOf({})); };
    const client = new GeminiClient({ apiKey: '', fetchImpl, sleep: noSleep });

    await assert.rejects(() => client.analyzeResumeMatch('r', 'jd'), /not configured/i);
    assert.equal(called, false);
});

test('normalizeAnalysis clamps an out-of-range score and caps list lengths', () => {
    const result = normalizeAnalysis({
        matchScore: 150,
        missingKeywords: Array.from({ length: 30 }, (_, i) => `kw${i}`),
        suggestions: Array.from({ length: 10 }, (_, i) => `s${i}`)
    });
    assert.equal(result.matchScore, 100);
    assert.equal(result.missingKeywords.length, 15);
    assert.equal(result.suggestions.length, 5);
});

test('normalizeAnalysis defaults missing or malformed fields safely', () => {
    const result = normalizeAnalysis({});
    assert.deepEqual(result, { matchScore: 0, missingKeywords: [], suggestions: [] });
});

test('normalizeAnalysis floors a negative score at zero', () => {
    assert.equal(normalizeAnalysis({ matchScore: -20 }).matchScore, 0);
});

test('buildPrompt embeds both inputs verbatim', () => {
    const prompt = buildPrompt('MY RESUME TEXT', 'MY JD TEXT');
    assert.match(prompt, /MY RESUME TEXT/);
    assert.match(prompt, /MY JD TEXT/);
});
