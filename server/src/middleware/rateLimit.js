'use strict';

const { AppError } = require('../errors');

/**
 * Fixed-window rate limiter. Every request here triggers a paid Gemini call,
 * so an unbounded client can run up API cost as easily as it can exhaust a
 * request quota - this caps both.
 */
function createRateLimiter({ windowMs, maxRequests, clock = Date.now } = {}) {
    const buckets = new Map();

    const sweeper = setInterval(() => {
        const now = clock();
        for (const [key, b] of buckets) if (now >= b.resetAt) buckets.delete(key);
    }, windowMs);
    if (sweeper.unref) sweeper.unref();

    function middleware(req, res, next) {
        const key = req.ip || 'unknown';
        const now = clock();
        let bucket = buckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + windowMs };
            buckets.set(key, bucket);
        }
        bucket.count += 1;

        res.set('RateLimit-Limit', String(maxRequests));
        res.set('RateLimit-Remaining', String(Math.max(maxRequests - bucket.count, 0)));

        if (bucket.count > maxRequests) {
            const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
            res.set('Retry-After', String(retryAfter));
            return next(new AppError('Rate limit exceeded. Please retry shortly.', 429, 'RATE_LIMITED'));
        }
        return next();
    }

    middleware.stop = () => clearInterval(sweeper);
    return middleware;
}

module.exports = { createRateLimiter };
