import { useEffect, useRef, useState } from 'react'
import { sendMessage } from './api.js'
import { getLearningState } from './learningStore.js'

const SILENCE_MS = 1000

const SpeechRecognitionAPI =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

function buildWelcomeMessage() {
  const { lastTopic } = getLearningState()
  const content = lastTopic
    ? `Hey, welcome back! Last time you were learning about "${lastTopic}". Want to keep going with that, or dive into something new today? Either way, just tell me what's on your mind — or head to the Learn tab for a structured lesson and quiz on it.`
    : "Hi! I'm your AI learning companion. Ask me about anything you're studying — a concept, a homework problem, or something you just read — and I'll help you work through it."
  return { role: 'assistant', content }
}

export default function Chat() {
  const [messages, setMessages] = useState(() => [buildWelcomeMessage()])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef(null)
  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const shouldAutoSendRef = useRef(false)
  const formRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (!SpeechRecognitionAPI) return

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInput(transcript)

      clearTimeout(silenceTimerRef.current)
      shouldAutoSendRef.current = true
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop()
      }, SILENCE_MS)
    }

    recognition.onend = () => {
      setIsListening(false)
      clearTimeout(silenceTimerRef.current)
      if (shouldAutoSendRef.current) {
        shouldAutoSendRef.current = false
        formRef.current?.requestSubmit()
      }
    }

    recognition.onerror = () => {
      setIsListening(false)
      clearTimeout(silenceTimerRef.current)
    }

    recognitionRef.current = recognition
    return () => recognition.stop()
  }, [])

  function toggleListening() {
    const recognition = recognitionRef.current
    if (!recognition) return

    if (isListening) {
      shouldAutoSendRef.current = false
      recognition.stop()
      return
    }

    setInput('')
    shouldAutoSendRef.current = false
    setIsListening(true)
    recognition.start()
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setError(null)
    setIsLoading(true)

    try {
      const reply = await sendMessage(nextMessages)
      setMessages([...nextMessages, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <main className="chat-window">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-bubble typing">Thinking…</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {error && <div className="error-banner">{error}</div>}

      <form className="composer" onSubmit={handleSend} ref={formRef}>
        {SpeechRecognitionAPI && (
          <button
            type="button"
            className={`mic-button ${isListening ? 'listening' : ''}`}
            onClick={toggleListening}
            disabled={isLoading}
            title={isListening ? 'Stop dictating' : 'Dictate your question'}
            aria-label={isListening ? 'Stop dictating' : 'Dictate your question'}
          >
            {isListening ? '●' : '🎤'}
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isListening
              ? 'Listening… pause for a second to send'
              : "Ask a question about what you're learning…"
          }
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </>
  )
}
