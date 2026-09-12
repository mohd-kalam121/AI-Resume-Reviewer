'use strict';

/** An error raised deliberately, safe to describe to the client. */
class AppError extends Error {
    constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.expose = true;
    }
}

class ValidationError extends AppError {
    constructor(message) {
        super(message, 400, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

class UpstreamError extends AppError {
    constructor(message) {
        super(message, 502, 'UPSTREAM_ERROR');
        this.name = 'UpstreamError';
    }
}

module.exports = { AppError, ValidationError, UpstreamError };
