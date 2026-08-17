import { useEffect, useMemo, useState } from 'react'
import { getFeedback, getRecommendation } from './api.js'
import { learner, skillLevel } from './mockData.js'
import { listTopics, getTrack, setTrack, addTopicFeedback } from './learningStore.js'
import './Dashboard.css'

function resolveInitialTrack(topicNames) {
  const saved = getTrack()
  if (saved && topicNames.includes(saved)) return saved
  return topicNames[0] ?? null
}

export default function Dashboard() {
  const [topics, setTopics] = useState(() => listTopics())
  const topicNames = useMemo(() => topics.map((t) => t.name), [topics])
  const [track, setTrackState] = useState(() => resolveInitialTrack(topicNames))

  const [submission, setSubmission] = useState('')
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [feedbackError, setFeedbackError] = useState(null)

  const [recommendation, setRecommendation] = useState(null)
  const [isRecommending, setIsRecommending] = useState(false)
  const [recommendError, setRecommendError] = useState(null)

  const topic = topics.find((t) => t.name === track) ?? null
  const score = topic?.status === 'completed' ? topic.score : null
  const level = typeof score === 'number' ? skillLevel(score) : null

  function refreshTopics() {
    setTopics(listTopics())
  }

  function handleTrackChange(e) {
    const value = e.target.value
    setTrackState(value)
    setTrack(value)
    setRecommendation(null)
    setRecommendError(null)
  }

  async function fetchRecommendation() {
    if (!topic || topic.status !== 'completed') return
    setIsRecommending(true)
    setRecommendError(null)
    try {
      const activity = {
        title: topic.name,
        type: 'Lesson + Quiz',
        score: topic.score,
        strengths: topic.strengths ?? [],
        suggestions: topic.suggestions ?? [],
      }
      const rec = await getRecommendation([activity])
      setRecommendation(rec)
    } catch (err) {
      setRecommendError(err.message)
    } finally {
      setIsRecommending(false)
    }
  }

  useEffect(() => {
    fetchRecommendation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track])

  async function handleEvaluate(e) {
    e.preventDefault()
    const text = submission.trim()
    if (!text || isEvaluating || !track) return

    setIsEvaluating(true)
    setFeedbackError(null)
    try {
      const feedback = await getFeedback(text)
      addTopicFeedback(track, {
        strengths: feedback.strengths,
        suggestions: feedback.suggestions,
      })
      refreshTopics()
      setSubmission('')
    } catch (err) {
      setFeedbackError(err.message)
    } finally {
      setIsEvaluating(false)
    }
  }

  if (topicNames.length === 0) {
    return (
      <div className="dashboard">
        <section className="panel">
          <h3>No topics yet</h3>
          <p className="empty">
            Head to the Learn tab and start a topic — your progress will show up here.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <section className="progress-card">
        <div>
          <h2>{learner.name}</h2>
          <select className="track-select" value={track ?? ''} onChange={handleTrackChange}>
            {topicNames.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="score-ring">
          <div className="score-value">{typeof score === 'number' ? score : '—'}</div>
          <div className="score-label">{level ?? (topic?.status === 'completed' ? '' : 'In Progress')}</div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <h3>Strengths</h3>
          {topic?.strengths?.length ? (
            <ul className="tag-list strengths">
              {topic.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="empty">
              Take the quiz in Learn, or submit work below, to see strengths for "{track}".
            </p>
          )}
        </div>

        <div className="panel">
          <h3>Areas for Improvement</h3>
          {topic?.suggestions?.length ? (
            <ul className="tag-list suggestions">
              {topic.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="empty">
              Take the quiz in Learn, or submit work below, to see suggestions for "{track}".
            </p>
          )}
        </div>
      </section>

      <section className="panel recommendation-panel">
        <div className="recommendation-header">
          <h3>Recommended Next Step</h3>
          <button
            onClick={fetchRecommendation}
            disabled={isRecommending || topic?.status !== 'completed'}
            type="button"
          >
            {isRecommending ? 'Thinking…' : 'Refresh'}
          </button>
        </div>
        {recommendError && <div className="error-banner">{recommendError}</div>}
        {topic?.status !== 'completed' ? (
          <p className="empty">Complete the "{track}" quiz in Learn to get a recommendation.</p>
        ) : recommendation ? (
          <div className="recommendation-body">
            <p className="next-activity">{recommendation.nextActivity}</p>
            <p className="reason">{recommendation.reason}</p>
          </div>
        ) : (
          !recommendError && <p className="empty">Generating a personalized recommendation…</p>
        )}
      </section>

      <section className="panel">
        <h3>Get AI Feedback on Your Work</h3>
        <p className="hint">
          Paste notes or describe work you did related to "{track}", and the AI will score it and
          add strengths/suggestions to this topic's tracking.
        </p>
        <form className="feedback-form" onSubmit={handleEvaluate}>
          <textarea
            value={submission}
            onChange={(e) => setSubmission(e.target.value)}
            placeholder={`e.g. Explain what you understood about "${track}" so far…`}
            rows={4}
            disabled={isEvaluating}
          />
          <button type="submit" disabled={isEvaluating || !submission.trim()}>
            {isEvaluating ? 'Evaluating…' : 'Get AI Feedback'}
          </button>
        </form>
        {feedbackError && <div className="error-banner">{feedbackError}</div>}
      </section>

      <section className="panel">
        <h3>"{track}" Progress</h3>
        <div className="activity-list">
          <div className="activity-card">
            <div className="activity-header">
              <div>
                <span className="activity-type">Lesson + Quiz</span>
                <h4>{track}</h4>
              </div>
              {typeof score === 'number' ? (
                <div className="activity-score">{score}</div>
              ) : (
                <div className="activity-score in-progress">In progress</div>
              )}
            </div>
            <p className="activity-date">
              {topic?.status === 'completed' && topic.completedAt
                ? `Completed ${new Date(topic.completedAt).toISOString().slice(0, 10)}`
                : `Started ${new Date(topic?.updatedAt ?? Date.now()).toISOString().slice(0, 10)}`}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
