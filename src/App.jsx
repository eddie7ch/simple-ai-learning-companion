import { useEffect, useRef, useState } from 'react'
import { sendMessage } from './api.js'
import './App.css'

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    "Hi! I'm your AI learning companion. Ask me about anything you're studying — a concept, a homework problem, or something you just read — and I'll help you work through it.",
}

export default function App() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

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
    <div className="app">
      <header className="app-header">
        <h1>AI Learning Companion</h1>
        <p>Your friendly study partner</p>
      </header>

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

      <form className="composer" onSubmit={handleSend}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about what you're learning…"
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
