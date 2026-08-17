// The learner profile shown on the Dashboard. Everything else the Dashboard
// displays (topics, scores, strengths, suggestions) comes from real topics
// created in the Learn tab — see learningStore.js.

export const learner = {
  name: 'Jamie Rivera',
}

export function skillLevel(score) {
  if (score >= 85) return 'Advanced'
  if (score >= 70) return 'Intermediate'
  return 'Beginner'
}
