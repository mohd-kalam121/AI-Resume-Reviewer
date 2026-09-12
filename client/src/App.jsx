import { useState } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function analyze(resume, jobDescription) {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume, jobDescription })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }
  return payload.data;
}

function ScoreBadge({ score }) {
  const tone = score >= 70 ? 'good' : score >= 40 ? 'mid' : 'low';
  return (
    <div className={`score-badge score-badge--${tone}`}>
      <span className="score-badge__value">{score}</span>
      <span className="score-badge__label">Match Score</span>
    </div>
  );
}

function App() {
  const [resume, setResume] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!resume.trim() || !jobDescription.trim()) {
      setError('Please provide both the resume text and the job description.');
      return;
    }

    setLoading(true);
    try {
      const data = await analyze(resume, jobDescription);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="header">
        <h1>AI Resume Reviewer</h1>
        <p>Paste a resume and a job description to get an ATS-style match score, missing keywords, and rewrite suggestions.</p>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <div className="form__field">
          <label htmlFor="resume">Resume</label>
          <textarea
            id="resume"
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="Paste resume text here..."
            rows={12}
          />
        </div>

        <div className="form__field">
          <label htmlFor="jd">Job Description</label>
          <textarea
            id="jd"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here..."
            rows={12}
          />
        </div>

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Analyzing...' : 'Analyze Match'}
        </button>
      </form>

      {error && <div className="alert alert--error">{error}</div>}

      {result && (
        <section className="results">
          <ScoreBadge score={result.matchScore} />

          <div className="results__column">
            <h2>Missing Keywords</h2>
            {result.missingKeywords.length === 0 ? (
              <p className="muted">No critical gaps detected.</p>
            ) : (
              <ul className="chip-list">
                {result.missingKeywords.map((kw) => (
                  <li key={kw} className="chip">{kw}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="results__column">
            <h2>Suggestions</h2>
            <ol className="suggestion-list">
              {result.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
