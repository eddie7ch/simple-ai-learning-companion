// Small backend proxy for Groq.
// Holds the API key server-side so it's never exposed to the browser.

import express from 'express'
import cors from 'cors'
import 'dotenv/config'

// Render (and most hosts) set PORT; BACKEND_PORT is the local-dev override.
const PORT = process.env.PORT || process.env.BACKEND_PORT || 8787
const API_KEY = process.env.GROQ_API_KEY
const MODEL = 'openai/gpt-oss-120b'
const API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const TUTOR_SYSTEM_PROMPT = `You are a friendly, encouraging AI learning companion and tutor.
Your job is to help the user understand topics, not just give them answers.
- Explain concepts clearly and step by step.
- Use simple examples and analogies where helpful.
- Ask a short follow-up question when it helps check understanding.
- Keep answers focused and not overly long unless the user asks for depth.
- If the user seems stuck, break the problem into smaller pieces.`

const SOCRATIC_SYSTEM_PROMPT = `You are a Socratic AI learning companion. Your job is to guide the
learner to discover answers themselves, not to hand them the answer.
- Never give the direct answer first. Respond with a guiding question that helps them
  reason toward it, based on what they already said.
- Ask one focused question at a time — don't stack multiple questions.
- Build on their previous answers; if they're on the right track, ask the next question
  that pushes their reasoning one step further.
- If they give a wrong or incomplete answer, don't just correct them — ask a question that
  helps them notice the gap themselves (e.g. "What happens if you try that with...?").
- Break big problems into smaller guiding questions rather than explaining the whole thing.
- If the learner is genuinely stuck after a few tries, or explicitly asks for the answer,
  give a small hint framed as a question first; only explain directly as a last resort,
  and say clearly that you're doing so.
- Keep questions short and conversational.`

const FEEDBACK_SYSTEM_PROMPT = `You are an AI evaluator for a coding education platform.
A learner will submit a description of work they completed, or a code snippet.
Evaluate it and respond with ONLY a compact JSON object, no markdown fences, no
extra commentary, in exactly this shape:
{"score": <integer 0-100>, "strengths": ["...", "..."], "suggestions": ["...", "..."]}
Give 2-4 strengths and 1-3 suggestions, each a short, specific, encouraging phrase.`

const RECOMMEND_SYSTEM_PROMPT = `You are an AI mentor for a coding education platform.
You will receive a learner's recent activity history (titles, types, scores,
strengths, and suggested improvements). Recommend the single most valuable next
learning activity for them. Respond with ONLY a compact JSON object, no markdown
fences, no extra commentary, in exactly this shape:
{"nextActivity": "...", "reason": "..."}
Keep "reason" to one or two sentences that reference specifics from their history.`

const LESSON_SYSTEM_PROMPT = `You are an AI curriculum writer for a technical learning platform,
writing a thorough lesson — not a quick summary. Given a topic a learner wants to study, write
a self-contained lesson document that teaches it from the ground up with real depth. Respond
with ONLY a compact JSON object, no markdown fences, no extra commentary, in exactly this shape:
{
  "title": "...",
  "summary": "one or two sentence overview",
  "sections": [
    { "heading": "...", "content": "2-3 substantial paragraphs, plain text, no markdown headers" }
  ]
}
Requirements:
- Write 6-8 sections that build on each other, simplest concepts first, ending with more
  advanced or edge-case material.
- Each section's "content" must be 2-3 full paragraphs (not bullet points), thorough enough
  to stand alone as study material — explain the "why" behind each idea, not just the "what".
- Include concrete examples or analogies, and (where the topic is technical/code-related) a
  short illustrative code snippet written inline as plain text where it genuinely helps.
- Cover the most common misconception or mistake learners make, and how to avoid it.
- Use plain, direct language. Be thorough but not padded — every sentence should teach
  something, so it reads like a well-written textbook chapter, not a stretched-out one.`

const QUIZ_SYSTEM_PROMPT = `You are an AI quiz writer for a technical learning platform.
Given a lesson topic and summary, write a short multiple-choice quiz that checks whether
the learner understood the material. Respond with ONLY a compact JSON object, no markdown
fences, no extra commentary, in exactly this shape:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "one sentence on why that's correct"
    }
  ]
}
Write exactly 4 questions, each with exactly 4 options and one correct answer.`

const ASK_SYSTEM_PROMPT = `You are answering a quick spoken question from a learner who just
interrupted while listening to a lesson being read aloud. Give a concise, direct, spoken-style
answer in 2-4 sentences — no markdown, no bullet points, no headers, since this will be read
aloud by a text-to-speech voice. Answer the question directly first, then briefly connect it
back to the lesson topic if relevant.`

const app = express()
app.use(cors())
app.use(express.json())

async function callGroq(systemPrompt, userContent, maxTokens) {
  if (!API_KEY) {
    throw Object.assign(new Error('Missing API key. Copy .env.example to .env and set GROQ_API_KEY.'), {
      status: 500,
    })
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw Object.assign(new Error(`Upstream error: ${errorBody}`), { status: response.status })
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

function parseJsonReply(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  return JSON.parse(cleaned)
}

app.post('/api/chat', async (req, res) => {
  const { messages, mode } = req.body
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Request body must include a messages array.' })
  }

  const systemPrompt = mode === 'socratic' ? SOCRATIC_SYSTEM_PROMPT : TUTOR_SYSTEM_PROMPT

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      return res.status(response.status).json({ error: `Upstream error: ${errorBody}` })
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content ?? ''
    res.json({ reply })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/feedback', async (req, res) => {
  const { submission } = req.body
  if (!submission || typeof submission !== 'string') {
    return res.status(400).json({ error: 'Request body must include a submission string.' })
  }

  try {
    const raw = await callGroq(FEEDBACK_SYSTEM_PROMPT, submission)
    const feedback = parseJsonReply(raw)
    res.json(feedback)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.post('/api/recommend', async (req, res) => {
  const { activities } = req.body
  if (!Array.isArray(activities)) {
    return res.status(400).json({ error: 'Request body must include an activities array.' })
  }

  const summary = activities
    .map(
      (a) =>
        `- ${a.title} (${a.type}), score ${a.score}/100. Strengths: ${a.strengths.join(
          ', '
        )}. Suggestions: ${a.suggestions.join(', ')}.`
    )
    .join('\n')

  try {
    const raw = await callGroq(RECOMMEND_SYSTEM_PROMPT, summary)
    const recommendation = parseJsonReply(raw)
    res.json(recommendation)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.post('/api/lesson', async (req, res) => {
  const { topic } = req.body
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'Request body must include a topic string.' })
  }

  try {
    const raw = await callGroq(LESSON_SYSTEM_PROMPT, topic, 4000)
    const lesson = parseJsonReply(raw)
    res.json(lesson)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.post('/api/quiz', async (req, res) => {
  const { topic, summary } = req.body
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'Request body must include a topic string.' })
  }

  try {
    const raw = await callGroq(QUIZ_SYSTEM_PROMPT, `Topic: ${topic}\nLesson summary: ${summary || ''}`)
    const quiz = parseJsonReply(raw)
    res.json(quiz)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.post('/api/ask', async (req, res) => {
  const { topic, summary, question } = req.body
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Request body must include a question string.' })
  }

  try {
    const answer = await callGroq(
      ASK_SYSTEM_PROMPT,
      `Lesson topic: ${topic || 'unknown'}\nLesson summary: ${summary || ''}\nLearner's question: ${question}`
    )
    res.json({ answer: answer.trim() })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Proxy server listening on http://localhost:${PORT}`)
})
