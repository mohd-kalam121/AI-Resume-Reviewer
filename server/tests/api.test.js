'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createRateLimiter } = require('../src/middleware/rateLimit');

function stubGeminiClient(result = { matchScore: 60, missingKeywords: ['SQL'], suggestions: ['Add SQL experience'] }) {
    return {
        calls: [],
        async analyzeResumeMatch(resume, jobDescription) {
            this.calls.push({ resume, jobDescription });
            if (result instanceof Error) throw result;
            return result;
        }
    };
}

async function withServer(geminiClient, run, { rateLimiter } = {}) {
    const app = createApp({ geminiClient, rateLimiter });
    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;

    const client = async (path, options = {}) => {
        const res = await fetch(base + path, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
    };

    try {
        await run(client);
    } finally {
        app.locals.rateLimiter?.stop?.();
        await new Promise(r => server.close(r));
    }
}

test('GET /health reports ok', async () => {
    await withServer(stubGeminiClient(), async (client) => {
        const res = await client('/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
    });
});

test('POST /api/analyze returns the analysis for a valid request', async () => {
    const gemini = stubGeminiClient();
    await withServer(gemini, async (client) => {
        const res = await client('/api/analyze', { method: 'POST', body: { resume: 'my resume', jobDescription: 'the jd' } });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.matchScore, 60);
        assert.deepEqual(gemini.calls[0], { resume: 'my resume', jobDescription: 'the jd' });
    });
});

test('POST /api/analyze rejects a missing field before calling Gemini', async () => {
    const gemini = stubGeminiClient();
    await withServer(gemini, async (client) => {
        const res = await client('/api/analyze', { method: 'POST', body: { resume: 'only resume' } });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'VALIDATION_ERROR');
        assert.equal(gemini.calls.length, 0, 'Gemini must not be called for an invalid request');
    });
});

test('an upstream Gemini failure surfaces as a 502, not a 500', async () => {
    const { UpstreamError } = require('../src/errors');
    const gemini = stubGeminiClient(new UpstreamError('Gemini returned 503.'));
    await withServer(gemini, async (client) => {
        const res = await client('/api/analyze', { method: 'POST', body: { resume: 'r', jobDescription: 'j' } });
        assert.equal(res.status, 502);
        assert.equal(res.body.code, 'UPSTREAM_ERROR');
    });
});

test('an unexpected error is reported generically, without leaking internals', async () => {
    const gemini = stubGeminiClient(new Error('some internal driver detail'));
    await withServer(gemini, async (client) => {
        const res = await client('/api/analyze', { method: 'POST', body: { resume: 'r', jobDescription: 'j' } });
        assert.equal(res.status, 500);
        assert.equal(res.body.message, 'An unexpected error occurred.');
    });
});

test('an unmatched route returns a structured 404', async () => {
    await withServer(stubGeminiClient(), async (client) => {
        const res = await client('/api/nope');
        assert.equal(res.status, 404);
        assert.equal(res.body.code, 'NOT_FOUND');
    });
});

test('the rate limiter returns 429 once the quota is spent', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    await withServer(stubGeminiClient(), async (client) => {
        const body = { resume: 'r', jobDescription: 'j' };
        for (let i = 0; i < 2; i++) {
            const res = await client('/api/analyze', { method: 'POST', body });
            assert.equal(res.status, 200);
        }
        const blocked = await client('/api/analyze', { method: 'POST', body });
        assert.equal(blocked.status, 429);
        assert.equal(blocked.body.code, 'RATE_LIMITED');
        assert.ok(blocked.headers.get('retry-after'));
    }, { rateLimiter: limiter });
});
