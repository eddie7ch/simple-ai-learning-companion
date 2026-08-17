# AI Learning Companion

A simple React chat app that acts as an AI study tutor, powered by the Anthropic Claude API.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your API key:

   ```bash
   cp .env.example .env
   ```

   Then open `.env` and set `VITE_ANTHROPIC_API_KEY` to your key from the
   [Anthropic Console](https://console.anthropic.com/).

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open the URL it prints (usually http://localhost:5173).

## How it works

- `src/App.jsx` — the chat UI: message list, input box, loading/error states.
- `src/api.js` — calls the Anthropic Messages API directly from the browser, with a
  system prompt that makes Claude act as a tutor (explains concepts, checks
  understanding, breaks problems into steps).
- `src/App.css` / `src/index.css` — plain, minimal styling.

## A note on the API key

This version calls the Anthropic API **directly from the browser**, which means
the API key is visible to anyone who opens the browser dev tools. That's fine
for local development and personal use, but **not safe to deploy publicly**.

For a real deployment, move the call in `src/api.js` to a small backend
(e.g. a Node/Express server or a serverless function) that holds the key
server-side, and have the React app call your backend instead of Anthropic
directly. Happy to help build that next if you want to take this further.

## Next steps / ideas

- Save chat history to localStorage so it persists across reloads.
- Let the user pick a subject/topic to focus the tutor's responses.
- Add flashcard or quiz generation as a second mode.
- Stream responses instead of waiting for the full reply.
