'use strict';

const config = require('./config');
const { ValidationError } = require('./errors');

function validateAnalyzeRequest(body) {
    const { resume, jobDescription } = body || {};

    if (typeof resume !== 'string' || resume.trim().length === 0) {
        throw new ValidationError('"resume" is required and must be non-empty text.');
    }
    if (typeof jobDescription !== 'string' || jobDescription.trim().length === 0) {
        throw new ValidationError('"jobDescription" is required and must be non-empty text.');
    }

    const { maxFieldLength } = config.limits;
    if (resume.length > maxFieldLength) {
        throw new ValidationError(`"resume" exceeds the ${maxFieldLength} character limit.`);
    }
    if (jobDescription.length > maxFieldLength) {
        throw new ValidationError(`"jobDescription" exceeds the ${maxFieldLength} character limit.`);
    }

    return { resume: resume.trim(), jobDescription: jobDescription.trim() };
}

module.exports = { validateAnalyzeRequest };
