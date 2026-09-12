'use strict';

require('dotenv').config();

/**
 * Centralised configuration, validated once at startup rather than read from
 * process.env scattered through the codebase.
 */
function int(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer, got "${raw}"`);
    return parsed;
}

const config = {
    port: int('PORT', 5000),
    env: process.env.NODE_ENV || 'development',

    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        timeoutMs: int('GEMINI_TIMEOUT_MS', 20_000),
        maxRetries: int('GEMINI_MAX_RETRIES', 3),
        retryBaseDelayMs: int('GEMINI_RETRY_BASE_MS', 800)
    },

    // Gemini pricing and quality both degrade on very long inputs; a resume
    // or JD longer than this is almost certainly a paste error, not real content.
    limits: {
        maxFieldLength: int('MAX_FIELD_LENGTH', 20_000)
    },

    rateLimit: {
        windowMs: int('RATE_LIMIT_WINDOW_MS', 60_000),
        maxRequests: int('RATE_LIMIT_MAX', 20)
    },

    cors: {
        allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '')
            .split(',').map(s => s.trim()).filter(Boolean)
    }
};

if (!config.gemini.apiKey && config.env !== 'test') {
    console.warn('[config] GEMINI_API_KEY is not set - /api/analyze will fail until it is.');
}

module.exports = config;
