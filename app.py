from flask import Flask, render_template, request
from google import genai
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Initialize the new GenAI client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def index():
    analysis_result = None
    error_msg = None

    if request.method == 'POST':
        job_description = request.form.get('jd')
        resume_text = request.form.get('resume')
        
        if not job_description or not resume_text:
            error_msg = "Please provide both the Job Description and Resume text."
        else:
            prompt = f"""
            You are a strict but helpful technical recruiter. Analyze the following resume against the provided job description.
            
            Job Description:
            {job_description}
            
            Resume:
            {resume_text}
            
            Return a structured critique containing exactly these three sections:
            1. Match Score: Give a percentage match score (e.g., "75% Match").
            2. Missing Keywords: Bullet points of critical skills or keywords in the JD that are missing from the resume.
            3. Improvement Suggestions: 3 actionable steps the candidate can take to tailor their resume for this specific role.
            """
            
            try:
                # Updated to the new SDK structure and current model
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt
                )
                analysis_result = response.text
            except Exception as e:
                error_msg = f"API Error: {str(e)}"
                
    return render_template('index.html', result=analysis_result, error=error_msg)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)