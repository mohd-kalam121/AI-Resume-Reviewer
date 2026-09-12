'use strict';

const express = require('express');
const cors = require('cors');

const config = require('./config');
const { GeminiClient } = require('./geminiClient');
const { createRateLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { createAnalyzeRouter } = require('./routes/analyze');

/**
 * App factory - importing this file opens no sockets and calls no external
 * API, so tests can build an app with a stubbed GeminiClient.
 */
function createApp({ geminiClient = new GeminiClient(), rateLimiter } = {}) {
    const app = express();
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    app.use(cors(corsOptions()));
    app.use(express.json({ limit: '256kb' }));

    app.get('/health', (req, res) => res.json({ status: 'ok' }));

    const limiter = rateLimiter || createRateLimiter(config.rateLimit);
    app.use('/api', limiter, createAnalyzeRouter({ geminiClient }));

    app.use(notFoundHandler);
    app.use(errorHandler);

    app.locals.rateLimiter = limiter;
    return app;
}

function corsOptions() {
    const { allowedOrigins } = config.cors;
    if (allowedOrigins.length === 0) return { origin: true };
    return {
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('Origin not permitted by CORS policy'));
        }
    };
}

module.exports = { createApp };
