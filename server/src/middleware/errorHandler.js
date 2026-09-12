'use strict';

const { AppError } = require('../errors');

const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

function notFoundHandler(req, res) {
    res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: `No route matches ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const isExpected = err instanceof AppError && err.expose;
    const statusCode = isExpected ? err.statusCode : 500;

    if (!isExpected) {
        console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    }

    res.status(statusCode).json({
        status: 'error',
        code: isExpected ? err.code : 'INTERNAL_ERROR',
        message: isExpected ? err.message : 'An unexpected error occurred.'
    });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
