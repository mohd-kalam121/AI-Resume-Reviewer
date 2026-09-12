'use strict';

const config = require('./config');
const { UpstreamError } = require('./errors');

/**
 * Client for the Gemini generateContent REST endpoint.
 *
 * The API sits behind three of the same failure modes as any hosted model
 * endpoint: transient 503s under load, per-request latency spikes, and rate
 * limiting. All three are handled here rather than left to whichever caller
 * happens to invoke the client first.
 *
 * The response is constrained with a JSON schema (responseSchema) so parsing
 * never depends on the model choosing to wrap its answer in markdown fences
 * or prose - it returns exactly the shape asked for, or the request fails
 * validation before it reaches the caller.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const ANALYSIS_SCHEMA = {
    type: 'OBJECT',
    properties: {
        matchScore: { type: 'INTEGER' },
        missingKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
        suggestions: { type: 'ARRAY', items: { type: 'STRING' } }
    },
    required: ['matchScore', 'missingKeywords', 'suggestions']
};

class GeminiClient {
    constructor(options = {}) {
        this.settings = { ...config.gemini, ...options };
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
        this.sleep = options.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    }

    /**
     * @returns {Promise<{matchScore:number, missingKeywords:string[], suggestions:string[]}>}
     */
    async analyzeResumeMatch(resume, jobDescription) {
        const prompt = buildPrompt(resume, jobDescription);
        const raw = await this.generateJson(prompt, ANALYSIS_SCHEMA);
        return normalizeAnalysis(raw);
    }

    async generateJson(prompt, schema) {
        if (!this.settings.apiKey) {
            throw new UpstreamError('Gemini API key is not configured on the server.');
        }

        const url = `${this.settings.baseUrl}/${this.settings.model}:generateContent?key=${this.settings.apiKey}`;
        const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
        };

        const payload = await this.postWithRetry(url, body);
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new UpstreamError('Gemini returned no content.');
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new UpstreamError('Gemini returned malformed JSON despite the schema constraint.');
        }
    }

    async postWithRetry(url, body) {
        const { maxRetries, retryBaseDelayMs } = this.settings;
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.postOnce(url, body);
            } catch (error) {
                lastError = error;
                if (!error.retryable || attempt === maxRetries) break;
                // Full jitter: avoids every retrying client synchronising on the
                // same backoff schedule after a shared upstream blip.
                const ceiling = retryBaseDelayMs * Math.pow(2, attempt);
                await this.sleep(Math.random() * ceiling);
            }
        }
        throw lastError;
    }

    async postOnce(url, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);

        let response;
        try {
            response = await this.fetchImpl(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });
        } catch (cause) {
            const error = new UpstreamError(
                cause.name === 'AbortError' ? 'Gemini request timed out.' : 'Gemini request failed.'
            );
            error.retryable = true;
            throw error;
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            // 503/429 mean the model is overloaded, not that anything is wrong
            // with the request. Once retries are exhausted the caller still
            // needs to know that trying again is the right move.
            const overloaded = response.status === 503 || response.status === 429;
            const error = new UpstreamError(
                overloaded
                    ? 'The AI service is busy right now. Please try again in a moment.'
                    : `The AI service returned an error (${response.status}).`
            );
            error.retryable = RETRYABLE_STATUS.has(response.status);
            throw error;
        }

        return response.json();
    }
}

function buildPrompt(resume, jobDescription) {
    return `You are a strict but helpful technical recruiter. Compare the resume to the job description.

RESUME:
${resume}

JOB DESCRIPTION:
${jobDescription}

Return:
- matchScore: an integer 0-100 estimating fit.
- missingKeywords: critical skills or requirements in the job description that are absent from the resume.
- suggestions: exactly 3 concrete, specific actions the candidate could take to close the gap.`;
}

/** Defensive clamping - a model can be schema-constrained and still return e.g. matchScore: 150. */
function normalizeAnalysis(raw) {
    const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
    return {
        matchScore: clamp(Math.round(Number(raw.matchScore) || 0), 0, 100),
        missingKeywords: Array.isArray(raw.missingKeywords) ? raw.missingKeywords.slice(0, 15) : [],
        suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.slice(0, 5) : []
    };
}

module.exports = { GeminiClient, ANALYSIS_SCHEMA, buildPrompt, normalizeAnalysis };
