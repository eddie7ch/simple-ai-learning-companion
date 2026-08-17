# AI Learning Companion

A prototype that helps a learner (e.g. a junior developer learning React) see
their progress, get AI feedback on their work, receive personalized next-step
recommendations, and ask a tutor questions — built as a React frontend with a
small backend proxy to Groq (free tier, no billing required).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your API key:

   ```bash
   cp .env.example .env
   ```

   Then open `.env` and set `GROQ_API_KEY` to a key created for free at
   [console.groq.com/keys](https://console.groq.com/keys).

3. Run the backend proxy and the dev server together:

   ```bash
   npm run dev:all
   ```

   Open the URL Vite prints (usually http://localhost:5173).

   Or run them separately in two terminals: `npm run server` and `npm run dev`.

## Features

The app has two tabs:

- **Dashboard** — the learner's progress view:
  - Overall score and skill level (Beginner / Intermediate / Advanced),
    computed from their activity history.
  - Aggregated **strengths** and **areas for improvement** across recent activities.
  - An **AI-generated "Recommended Next Step"**, dynamically produced by sending
    the learner's activity history to the model and asking it to pick and
    justify the single most valuable next activity.
  - A **"Get AI Feedback"** box where the learner can paste code or describe
    work they did; the AI evaluates it and returns a score, strengths, and
    suggestions (same shape as the assignment's example), which is then added
    to their activity history live.
  - An **Activity History** list seeded with realistic mock data (a coding
    exercise, a lesson, and a quiz), matching the assignment's example format.
- **AI Tutor Chat** — a conversational tutor (the original feature of this
  app) that explains concepts, answers questions, and can be dictated to by
  voice (auto-sends after a second of silence).

This covers all three AI capabilities described in the assignment brief:
evaluating learner work, recommending next steps, and answering questions.

## How it works

- `src/App.jsx` — top-level shell with tab navigation between Dashboard and Chat.
- `src/Dashboard.jsx` / `src/Dashboard.css` — the progress view described above.
- `src/mockData.js` — the learner profile and seeded activity history.
- `src/Chat.jsx` — the tutor chat UI (message list, input, voice dictation).
- `src/api.js` — calls the app's own backend proxy (`/api/chat`, `/api/feedback`,
  `/api/recommend`).
- `server/index.js` — a small Express server that holds the Groq API key and
  forwards three kinds of requests to Groq's OpenAI-compatible API
  (`openai/gpt-oss-120b`):
  - `/api/chat` — free-form tutoring conversation.
  - `/api/feedback` — evaluates a learner's submitted work, returns
    `{ score, strengths, suggestions }`.
  - `/api/recommend` — given the activity history, returns
    `{ nextActivity, reason }`.

## Assumptions made

- **Mock learner and activity history.** There's no backend/database (per the
  assignment's scope), so `src/mockData.js` seeds one learner with three
  completed activities (a coding exercise, a lesson, and a quiz) with
  realistic AI-style feedback already attached, matching the example in the
  brief.
- **Live LLM calls instead of fully mocked AI.** The assignment allows mocked
  AI responses, but since a working backend proxy already existed, feedback
  and recommendations call a real model (Groq) rather than static text —
  the tradeoff is that responses vary each time and depend on an external
  service being up.
- **Single learner, no persistence.** New activities added via "Get AI
  Feedback" live only in React state for the session — they reset on reload.
  This matches the "no database" constraint in the assignment.
- **Skill level is a simple threshold on average score** (Beginner /
  Intermediate / Advanced), not a more nuanced per-topic mastery model — kept
  simple given the prototype scope.
- **No authentication or routing**, as explicitly out of scope; the two
  "pages" are implemented as an in-memory tab switch, not real routes.

## Why a backend proxy

Calling a model API directly from the browser would expose the API key to
anyone who opens dev tools. Instead, the key lives only in `server/index.js`
(read from `.env`), and the browser only ever talks to this app's own
backend, which never sends the key to the client.

## Next steps / ideas

- Persist activity history (localStorage or a real backend) so it survives reloads.
- Break "strengths/areas for improvement" out per skill/topic instead of a flat list.
- Let the learner pick a track/subject to focus recommendations.
- Stream chat responses instead of waiting for the full reply.
- Deploy the backend (Render, Fly.io, a small VPS) and the frontend
  (Vercel/Netlify) separately, setting `VITE_BACKEND_URL` to the deployed
  backend's URL.
