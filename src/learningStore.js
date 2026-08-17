// Persists the learner's topics and progress in localStorage.
// There's no backend/database in this prototype, so "memory" of what the
// learner studied last lives in the browser.

const STORAGE_KEY = 'ai-learning-companion:state'

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { lastTopic: null, topics: {} }
  } catch {
    return { lastTopic: null, topics: {} }
  }
}

function write(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function getLearningState() {
  return read()
}

export function getTrack() {
  return read().track ?? null
}

export function setTrack(track) {
  const state = read()
  state.track = track
  write(state)
}

export function getTopic(topicName) {
  const state = read()
  return state.topics[topicName] ?? null
}

export function saveTopic(topicName, updates) {
  const state = read()
  const existing = state.topics[topicName] ?? { status: 'new' }
  state.topics[topicName] = { ...existing, ...updates, name: topicName }
  state.lastTopic = topicName
  write(state)
  return state.topics[topicName]
}

/**
 * Appends AI feedback (from the "Get AI Feedback" box) onto a topic's
 * existing strengths/suggestions, deduping.
 */
export function addTopicFeedback(topicName, { strengths = [], suggestions = [] }) {
  const state = read()
  const existing = state.topics[topicName] ?? { status: 'new' }
  const mergedStrengths = [...new Set([...(existing.strengths ?? []), ...strengths])]
  const mergedSuggestions = [...new Set([...(existing.suggestions ?? []), ...suggestions])]
  state.topics[topicName] = {
    ...existing,
    name: topicName,
    strengths: mergedStrengths,
    suggestions: mergedSuggestions,
    updatedAt: Date.now(),
  }
  state.lastTopic = topicName
  write(state)
  return state.topics[topicName]
}

export function deleteTopic(topicName) {
  const state = read()
  delete state.topics[topicName]
  if (state.lastTopic === topicName) {
    const remaining = Object.values(state.topics).sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    )
    state.lastTopic = remaining[0]?.name ?? null
  }
  write(state)
}

export function listTopics() {
  const state = read()
  return Object.values(state.topics).sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  )
}
