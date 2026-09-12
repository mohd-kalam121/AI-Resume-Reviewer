# AI Resume Reviewer

A full-stack tool that scores a resume against a job description using the
Gemini API — an ATS-style match score, the specific keywords missing from
the resume, and concrete rewrite suggestions.

![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)
![Tests](https://img.shields.io/badge/tests-25%20passing-brightgreen)

## Architecture

```
client/          React + Vite frontend
server/          Node.js + Express REST API
  src/
    geminiClient.js    Gemini REST client: retry, timeout, schema-constrained JSON
    validate.js        Request validation
    routes/analyze.js  POST /api/analyze
    middleware/        Rate limiting, centralised error handling
  tests/               25 tests, Node's built-in test runner, no live API calls
```

## Design notes

- **The Gemini response is schema-constrained**, not parsed from free text.
  The request includes a `responseSchema` (`matchScore: integer`,
  `missingKeywords: string[]`, `suggestions: string[]`), so the API always
  gets back exactly that shape or the request fails cleanly.
- **Retry with jittered exponential backoff on transient failures only.**
  The Gemini endpoint returns 503 under load fairly often in practice; a
  503/429/5xx is retried, a 400 is not, since retrying a malformed request
  just reproduces the same 400.
- **Every request is validated before it reaches Gemini** — non-empty fields
  and a length cap on both inputs, so a paste error doesn't turn into a
  large, costly API call.
- **Rate limited per client**, since every request here is a paid API call,
  not just a compute cost.
- **25 tests**, zero test dependencies. The Gemini client is tested via a
  stubbed `fetch` (retry logic, timeout, malformed response, missing key),
  with no live network calls in the suite; the Express layer is tested
  end-to-end with a stubbed client, including that a validation failure
  never reaches Gemini at all.

## Running locally

**Server:**
```bash
cd server
npm install
cp .env.example .env   # add your GEMINI_API_KEY
npm run dev             # http://localhost:5000
```

**Client**, in a second terminal:
```bash
cd client
npm install
cp .env.example .env
npm run dev             # http://localhost:5173
```

**Tests:**
```bash
cd server
npm test
```

## API

### `POST /api/analyze`

```jsonc
// Request
{ "resume": "...", "jobDescription": "..." }
```

```jsonc
// 200 OK
{
  "status": "success",
  "data": {
    "matchScore": 75,
    "missingKeywords": ["CI/CD", "SQL"],
    "suggestions": ["...", "...", "..."]
  }
}
```

Errors follow one shape: `{ "status": "error", "code": "...", "message": "..." }`,
with `VALIDATION_ERROR` (400), `RATE_LIMITED` (429), `UPSTREAM_ERROR` (502) and
`INTERNAL_ERROR` (500).

## Stack

**Server** — Node.js, Express, native `fetch` (no SDK dependency for the
Gemini call)
**Client** — React, Vite

## Limitations

- Resume and job description are pasted as text; no PDF upload yet.
- No persistence — each analysis is stateless.
- No authentication; this is a single-user utility, not a multi-tenant product.

## Author

**Mohd Kalam** — B.Tech Mathematics & Computing, Delhi Technological University (DTU)
