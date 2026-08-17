// Simple client for the Anthropic Messages API.
// Reads the API key from a Vite env var (see .env.example).

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'

const SYSTEM_PROMPT = `You are a friendly, encouraging AI learning companion and tutor.
Your job is to help the user understand topics, not just give them answers.
- Explain concepts clearly and step by step.
- Use simple examples and analogies where helpful.
- Ask a short follow-up question when it helps check understanding.
- Keep answers focused and not overly long unless the user asks for depth.
- If the user seems stuck, break the problem into smaller pieces.`

/**
 * Sends the full conversation to Claude and returns the assistant's reply text.
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 */
export async function sendMessage(messages) {
  if (!API_KEY) {
    throw new Error(
      'Missing API key. Copy .env.example to .env and set VITE_ANTHROPIC_API_KEY.'
    )
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      // Required to call the Anthropic API directly from a browser.
      // See the note in .env.example about the security tradeoffs.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`API error ${response.status}: ${errorBody}`)
  }

  const data = await response.json()
  const textBlock = data.content?.find((block) => block.type === 'text')
  return textBlock ? textBlock.text : ''
}
