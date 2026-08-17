// Client for the app's own backend proxy (see server/index.js), which
// holds the Groq API key server-side.

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787'

async function postJson(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `API error ${response.status}`)
  }

  return data
}

/**
 * Sends the full conversation to the tutor model and returns the assistant's reply text.
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @param {{ socratic?: boolean }} [options]
 */
export async function sendMessage(messages, options = {}) {
  const data = await postJson('/api/chat', {
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    mode: options.socratic ? 'socratic' : 'direct',
  })
  return data.reply
}

/**
 * Evaluates a learner's work submission and returns AI-generated feedback.
 * @param {string} submission
 * @returns {Promise<{score: number, strengths: string[], suggestions: string[]}>}
 */
export async function getFeedback(submission) {
  return postJson('/api/feedback', { submission })
}

/**
 * Recommends the learner's next activity based on their history.
 * @param {Array<object>} activities
 * @returns {Promise<{nextActivity: string, reason: string}>}
 */
export async function getRecommendation(activities) {
  return postJson('/api/recommend', { activities })
}

/**
 * Generates a lesson document for a topic.
 * @param {string} topic
 * @returns {Promise<{title: string, summary: string, sections: Array<{heading: string, content: string}>}>}
 */
export async function getLesson(topic) {
  return postJson('/api/lesson', { topic })
}

/**
 * Generates a short multiple-choice quiz for a topic.
 * @param {string} topic
 * @param {string} summary
 * @returns {Promise<{questions: Array<{question: string, options: string[], correctIndex: number, explanation: string}>}>}
 */
export async function getQuiz(topic, summary) {
  return postJson('/api/quiz', { topic, summary })
}

/**
 * Answers a quick spoken question asked while a lesson is being read aloud.
 * @param {string} topic
 * @param {string} summary
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function getAskAnswer(topic, summary, question) {
  const data = await postJson('/api/ask', { topic, summary, question })
  return data.answer
}
