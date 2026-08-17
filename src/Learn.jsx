import { useEffect, useRef, useState } from 'react'
import { getLesson, getQuiz, getRecommendation, getFeedback, sendMessage } from './api.js'
import { getLearningState, saveTopic, listTopics, deleteTopic } from './learningStore.js'
import { useLessonNarrator } from './useLessonNarrator.js'
import './Learn.css'

// view: 'lesson' | 'quiz' | 'socratic-quiz' | 'result'
export default function Learn() {
  const [topics, setTopics] = useState(() => listTopics())
  const [lastTopic, setLastTopic] = useState(() => getLearningState().lastTopic)
  const [selected, setSelected] = useState(null)
  const [topicInput, setTopicInput] = useState('')
  const [view, setView] = useState('lesson')

  const [isLoadingLesson, setIsLoadingLesson] = useState(false)
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false)
  const [isRecommending, setIsRecommending] = useState(false)
  const [error, setError] = useState(null)

  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [nextStep, setNextStep] = useState(null)

  const [socraticMessages, setSocraticMessages] = useState([])
  const [socraticInput, setSocraticInput] = useState('')
  const [isSocraticLoading, setIsSocraticLoading] = useState(false)
  const [isGrading, setIsGrading] = useState(false)

  function refreshTopics() {
    setTopics(listTopics())
    setLastTopic(getLearningState().lastTopic)
  }

  function handleDeleteTopic(e, name) {
    e.stopPropagation()
    if (selected === name) narrator.stop()
    deleteTopic(name)
    refreshTopics()
    if (selected === name) {
      setSelected(null)
      setView('lesson')
      setResult(null)
      setNextStep(null)
    }
  }

  async function openTopic(name) {
    narrator.stop()
    setSelected(name)
    setView('lesson')
    setAnswers({})
    setResult(null)
    setNextStep(null)
    setError(null)
    setSocraticMessages([])
    setSocraticInput('')

    const existing = getLearningState().topics[name]
    if (existing?.lesson) return

    setIsLoadingLesson(true)
    try {
      const lesson = await getLesson(name)
      saveTopic(name, { lesson, status: 'lesson-ready', updatedAt: Date.now() })
      refreshTopics()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoadingLesson(false)
    }
  }

  function handleStartTopic(e) {
    e.preventDefault()
    const name = topicInput.trim()
    if (!name) return
    setTopicInput('')
    openTopic(name)
  }

  const currentTopic = selected ? getLearningState().topics[selected] : null

  const narrator = useLessonNarrator(selected, currentTopic?.lesson)
  const chunkRefs = useRef({})
  const contentRef = useRef(null)
  const lastUserScrollRef = useRef(0)
  const autoScrollingRef = useRef(false)

  function handleContentScroll() {
    if (autoScrollingRef.current) return
    lastUserScrollRef.current = Date.now()
  }

  useEffect(() => {
    if (!narrator.isReading || narrator.currentChunkIndex < 0) return
    // Don't yank the page back if the learner scrolled themselves in the last
    // few seconds — let them freely look around while it keeps reading.
    if (Date.now() - lastUserScrollRef.current < 4000) return

    const el = chunkRefs.current[narrator.currentChunkIndex]
    if (!el) return
    autoScrollingRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      autoScrollingRef.current = false
    }, 600)
  }, [narrator.currentChunkIndex, narrator.isReading])

  async function startQuiz() {
    if (!currentTopic) return
    narrator.stop()
    setView('quiz')
    setError(null)

    if (currentTopic.quiz) return

    setIsLoadingQuiz(true)
    try {
      const quiz = await getQuiz(selected, currentTopic.lesson?.summary)
      saveTopic(selected, { quiz, updatedAt: Date.now() })
      refreshTopics()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoadingQuiz(false)
    }
  }

  function selectAnswer(questionIndex, optionIndex) {
    setAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }))
  }

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max)}…` : text
  }

  function buildQuizFeedback(questions) {
    const strengths = []
    const suggestions = []
    questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) {
        strengths.push(truncate(q.question, 70))
      } else {
        suggestions.push(truncate(`${q.question} — ${q.explanation}`, 90))
      }
    })
    return { strengths: strengths.slice(0, 4), suggestions: suggestions.slice(0, 4) }
  }

  async function submitQuiz() {
    const questions = currentTopic.quiz.questions
    let correct = 0
    questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) correct += 1
    })
    const score = Math.round((correct / questions.length) * 100)
    const { strengths, suggestions } = buildQuizFeedback(questions)

    saveTopic(selected, {
      status: 'completed',
      score,
      strengths,
      suggestions,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    })
    refreshTopics()
    setResult({ correct, total: questions.length, score })
    setView('result')

    setIsRecommending(true)
    try {
      const activity = { title: selected, type: 'Lesson + Quiz', score, strengths, suggestions }
      const rec = await getRecommendation([activity])
      setNextStep(rec)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsRecommending(false)
    }
  }

  async function startSocraticQuiz() {
    narrator.stop()
    setView('socratic-quiz')
    setError(null)
    setSocraticMessages([])
    setIsSocraticLoading(true)
    try {
      const kickoff = [
        {
          role: 'user',
          content: `Quiz me on "${selected}" using Socratic questioning, based on this lesson: ${currentTopic.lesson?.summary}`,
        },
      ]
      const reply = await sendMessage(kickoff, { socratic: true })
      setSocraticMessages([...kickoff, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSocraticLoading(false)
    }
  }

  async function sendSocraticAnswer(e) {
    e.preventDefault()
    const text = socraticInput.trim()
    if (!text || isSocraticLoading) return

    const next = [...socraticMessages, { role: 'user', content: text }]
    setSocraticMessages(next)
    setSocraticInput('')
    setIsSocraticLoading(true)
    setError(null)
    try {
      const reply = await sendMessage(next, { socratic: true })
      setSocraticMessages([...next, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSocraticLoading(false)
    }
  }

  async function finishSocraticQuiz() {
    setIsGrading(true)
    setError(null)
    const transcript = socraticMessages
      .map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.content}`)
      .join('\n\n')

    try {
      const feedback = await getFeedback(
        `This is a transcript of a Socratic quiz on "${selected}". Evaluate how well the learner demonstrated understanding through their answers.\n\n${transcript}`
      )
      saveTopic(selected, {
        status: 'completed',
        score: feedback.score,
        strengths: feedback.strengths,
        suggestions: feedback.suggestions,
        quizType: 'socratic',
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
      refreshTopics()
      setResult({ score: feedback.score, socratic: true })
      setView('result')

      setIsRecommending(true)
      try {
        const activity = {
          title: selected,
          type: 'Lesson + Quiz',
          score: feedback.score,
          strengths: feedback.strengths,
          suggestions: feedback.suggestions,
        }
        const rec = await getRecommendation([activity])
        setNextStep(rec)
      } catch (err) {
        setError(err.message)
      } finally {
        setIsRecommending(false)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsGrading(false)
    }
  }

  function chunkClass(chunkIndex) {
    if (!narrator.isReading) return ''
    if (chunkIndex < narrator.currentChunkIndex) return 'chunk-read'
    if (chunkIndex === narrator.currentChunkIndex) return 'chunk-current'
    return 'chunk-upcoming'
  }

  function renderHighlighted(text, isActivePhase) {
    if (!isActivePhase || !narrator.wordRange) return text
    const { start, end } = narrator.wordRange
    if (start == null || start >= text.length) return text
    const safeEnd = Math.min(end, text.length)
    return (
      <>
        {text.slice(0, start)}
        <mark className="read-word">{text.slice(start, safeEnd)}</mark>
        {text.slice(safeEnd)}
      </>
    )
  }

  function splitSentences(text) {
    return text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text]
  }

  function renderClickableContent(chunkIndex, text, isActivePhase) {
    if (!narrator.supported) return text
    const sentences = splitSentences(text)
    let offset = 0
    return sentences.map((sentence, i) => {
      const start = offset
      offset += sentence.length
      const hasWordHere =
        isActivePhase &&
        narrator.wordRange &&
        narrator.wordRange.start >= start &&
        narrator.wordRange.start < start + sentence.length
      return (
        <span
          key={i}
          className="sentence"
          onClick={() => narrator.seek(chunkIndex, 'content', start)}
          title="Click to read from here"
        >
          {hasWordHere ? (
            <>
              {sentence.slice(0, narrator.wordRange.start - start)}
              <mark className="read-word">
                {sentence.slice(
                  narrator.wordRange.start - start,
                  Math.min(narrator.wordRange.end - start, sentence.length)
                )}
              </mark>
              {sentence.slice(Math.min(narrator.wordRange.end - start, sentence.length))}
            </>
          ) : (
            sentence
          )}
        </span>
      )
    })
  }

  return (
    <div className="learn">
      <aside className="learn-sidebar">
        <form className="new-topic-form" onSubmit={handleStartTopic}>
          <input
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="e.g. Basic Chemistry, Big-O notation…"
          />
          <button type="submit" disabled={!topicInput.trim()}>
            Start Learning
          </button>
        </form>

        <div className="topic-list">
          {topics.length === 0 && <p className="empty">No topics yet — start one above.</p>}
          {topics.map((t) => (
            <div
              key={t.name}
              className={`topic-item ${selected === t.name ? 'active' : ''}`}
              onClick={() => openTopic(t.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openTopic(t.name)
              }}
              role="button"
              tabIndex={0}
            >
              <span className="topic-name">{t.name}</span>
              {t.status === 'completed' ? (
                <span className="topic-score">{t.score}</span>
              ) : (
                <span className="topic-status">In progress</span>
              )}
              <button
                type="button"
                className="topic-delete"
                onClick={(e) => handleDeleteTopic(e, t.name)}
                title={`Delete "${t.name}"`}
                aria-label={`Delete "${t.name}"`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main className="learn-content" ref={contentRef} onScroll={handleContentScroll}>
        {!selected && (
          <div className="learn-welcome">
            {lastTopic ? (
              <>
                <h2>Welcome back!</h2>
                <p>Last time you were learning about "{lastTopic}". Want to continue, or start something new today?</p>
                <div className="welcome-actions">
                  <button onClick={() => openTopic(lastTopic)}>Continue {lastTopic}</button>
                </div>
              </>
            ) : (
              <>
                <h2>What do you want to learn today?</h2>
                <p>Type a topic on the left and I'll build you a lesson, then quiz you on it.</p>
              </>
            )}
          </div>
        )}

        {selected && error && <div className="error-banner">{error}</div>}

        {selected && view === 'lesson' && (
          <>
            {isLoadingLesson && <p className="loading">Writing your lesson on "{selected}"…</p>}
            {currentTopic?.lesson && (
              <article className="lesson-doc">
                <div className={chunkClass(0)} ref={(el) => (chunkRefs.current[0] = el)}>
                  <h2
                    className={narrator.supported ? 'clickable-heading' : ''}
                    onClick={narrator.supported ? () => narrator.seek(0, 'heading', 0) : undefined}
                    title={narrator.supported ? 'Click to read from here' : undefined}
                  >
                    {renderHighlighted(
                      currentTopic.lesson.title,
                      narrator.isReading && narrator.currentChunkIndex === 0 && narrator.phase === 'heading'
                    )}
                  </h2>
                  <p className="lesson-summary">
                    {renderClickableContent(
                      0,
                      currentTopic.lesson.summary,
                      narrator.isReading && narrator.currentChunkIndex === 0 && narrator.phase === 'content'
                    )}
                  </p>
                </div>
                <div className="quiz-choice">
                  <button className="quiz-button" onClick={startQuiz}>
                    {currentTopic.status === 'completed' ? 'Retake Quiz' : 'Take the Quiz'}
                  </button>
                  <button className="quiz-button secondary" onClick={startSocraticQuiz}>
                    Take Socratic Quiz
                  </button>
                  {narrator.supported && (
                    <button
                      className="quiz-button secondary"
                      onClick={narrator.isReading ? narrator.stop : narrator.start}
                    >
                      {narrator.isReading ? '⏹ Stop Reading' : '🔊 Read it to me'}
                    </button>
                  )}
                  {narrator.supported && narrator.isReading && (
                    <button
                      className="quiz-button secondary"
                      onClick={narrator.askNow}
                      disabled={narrator.isAnswering || narrator.isAskListening}
                    >
                      {narrator.isAskListening ? '🎤 Listening…' : '🎤 Ask a Question'}
                    </button>
                  )}
                </div>

                {narrator.isReading && (
                  <div className="narrator-status">
                    {narrator.isAskListening ? (
                      <span>🎤 Listening — ask anything, pause when you're done…</span>
                    ) : narrator.isAnswering ? (
                      <span>💬 Answering your question…</span>
                    ) : narrator.isPaused ? (
                      <span>⏸ Paused</span>
                    ) : (
                      <span>🔊 Reading aloud — click 🎤 Ask a Question anytime to interrupt</span>
                    )}
                  </div>
                )}

                {narrator.error && <div className="error-banner">{narrator.error}</div>}

                {narrator.lastAnswer && (
                  <div className="narrator-answer">
                    <p className="narrator-question">You asked: "{narrator.lastAnswer.question}"</p>
                    <p className="narrator-answer-text">{narrator.lastAnswer.answer}</p>
                  </div>
                )}
                {currentTopic.lesson.sections.map((s, i) => {
                  const chunkIndex = i + 1
                  return (
                    <section
                      key={i}
                      className={chunkClass(chunkIndex)}
                      ref={(el) => (chunkRefs.current[chunkIndex] = el)}
                    >
                      <h3
                        className={narrator.supported ? 'clickable-heading' : ''}
                        onClick={
                          narrator.supported ? () => narrator.seek(chunkIndex, 'heading', 0) : undefined
                        }
                        title={narrator.supported ? 'Click to read from here' : undefined}
                      >
                        {renderHighlighted(
                          s.heading,
                          narrator.isReading &&
                            narrator.currentChunkIndex === chunkIndex &&
                            narrator.phase === 'heading'
                        )}
                      </h3>
                      <p>
                        {renderClickableContent(
                          chunkIndex,
                          s.content,
                          narrator.isReading &&
                            narrator.currentChunkIndex === chunkIndex &&
                            narrator.phase === 'content'
                        )}
                      </p>
                    </section>
                  )
                })}
              </article>
            )}
          </>
        )}

        {selected && view === 'quiz' && (
          <div className="quiz">
            {isLoadingQuiz && <p className="loading">Writing a quiz on "{selected}"…</p>}
            {currentTopic?.quiz && (
              <>
                {currentTopic.quiz.questions.map((q, qi) => (
                  <div key={qi} className="quiz-question">
                    <p className="question-text">
                      {qi + 1}. {q.question}
                    </p>
                    <div className="options">
                      {q.options.map((opt, oi) => (
                        <label key={oi} className="option">
                          <input
                            type="radio"
                            name={`q${qi}`}
                            checked={answers[qi] === oi}
                            onChange={() => selectAnswer(qi, oi)}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  className="quiz-button"
                  onClick={submitQuiz}
                  disabled={Object.keys(answers).length < currentTopic.quiz.questions.length}
                >
                  Submit Quiz
                </button>
              </>
            )}
          </div>
        )}

        {selected && view === 'socratic-quiz' && (
          <div className="socratic-quiz">
            <div className="socratic-messages">
              {socraticMessages.map((m, i) => (
                <div key={i} className={`socratic-message ${m.role}`}>
                  <div className="socratic-bubble">{m.content}</div>
                </div>
              ))}
              {isSocraticLoading && (
                <div className="socratic-message assistant">
                  <div className="socratic-bubble typing">Thinking…</div>
                </div>
              )}
            </div>

            <form className="socratic-composer" onSubmit={sendSocraticAnswer}>
              <input
                type="text"
                value={socraticInput}
                onChange={(e) => setSocraticInput(e.target.value)}
                placeholder="Answer the question…"
                disabled={isSocraticLoading || isGrading}
              />
              <button type="submit" disabled={isSocraticLoading || isGrading || !socraticInput.trim()}>
                Send
              </button>
            </form>

            <button
              className="quiz-button finish-socratic"
              onClick={finishSocraticQuiz}
              disabled={socraticMessages.length < 2 || isSocraticLoading || isGrading}
            >
              {isGrading ? 'Grading…' : 'Finish & Get Score'}
            </button>
          </div>
        )}

        {selected && view === 'result' && result && (
          <div className="quiz-result">
            <div className="result-score">
              <div className="result-value">{result.score}</div>
              <div className="result-label">
                {result.socratic
                  ? 'Socratic quiz score'
                  : `${result.correct} / ${result.total} correct`}
              </div>
            </div>

            {result.socratic ? (
              <div className="answer-review">
                <div className="review-item correct">
                  <p className="question-text">Strengths</p>
                  <ul>
                    {(currentTopic.strengths ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="review-item incorrect">
                  <p className="question-text">Suggestions</p>
                  <ul>
                    {(currentTopic.suggestions ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="answer-review">
                {currentTopic.quiz.questions.map((q, i) => (
                  <div key={i} className={`review-item ${answers[i] === q.correctIndex ? 'correct' : 'incorrect'}`}>
                    <p className="question-text">{q.question}</p>
                    <p className="your-answer">
                      Your answer: {q.options[answers[i]]}
                      {answers[i] !== q.correctIndex && (
                        <> — Correct: {q.options[q.correctIndex]}</>
                      )}
                    </p>
                    <p className="explanation">{q.explanation}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="next-step-panel">
              <h3>What to study next</h3>
              {isRecommending && <p className="loading">Thinking…</p>}
              {nextStep && (
                <>
                  <p className="next-activity">{nextStep.nextActivity}</p>
                  <p className="reason">{nextStep.reason}</p>
                  <button onClick={() => openTopic(nextStep.nextActivity)}>
                    Start this topic
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
