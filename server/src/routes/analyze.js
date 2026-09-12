'use strict';

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateAnalyzeRequest } = require('../validate');

function createAnalyzeRouter({ geminiClient }) {
    const router = express.Router();

    router.post('/analyze', asyncHandler(async (req, res) => {
        const { resume, jobDescription } = validateAnalyzeRequest(req.body);
        const analysis = await geminiClient.analyzeResumeMatch(resume, jobDescription);
        res.json({ status: 'success', data: analysis });
    }));

    return router;
}

module.exports = { createAnalyzeRouter };
