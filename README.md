# StudyMate AI

A simple one-page collection of ten student-focused AI tools:

- Resume builder
- Notes generator
- Presentation slide maker
- Syllabus mind map
- Google Sheets dashboard
- Quiz / MCQ generator
- Subject tutor chat
- Flashcard generator
- Study planner
- Photo-note OCR summarizer

## Run it

Open `index.html` in a modern browser. No build step is needed.

The app starts in **Demo mode**, so every tool can be explored without an API key. To use real AI output, select the settings icon and enter a Gemini API key and model name. The key is stored only in the current browser session; do not put private production keys in a public front-end website.

The photo-note tool loads Tesseract.js from jsDelivr for in-browser OCR, so it needs an internet connection for its first use. The Sheets dashboard works with its included sample data or a JSON-returning Google Apps Script web-app URL.
