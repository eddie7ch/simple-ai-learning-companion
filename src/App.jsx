import { useState } from 'react'
import Chat from './Chat.jsx'
import Dashboard from './Dashboard.jsx'
import Learn from './Learn.jsx'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('learn')

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Learning Companion</h1>
        <p>Your friendly study partner</p>
        <nav className="tab-nav">
          <button className={tab === 'learn' ? 'active' : ''} onClick={() => setTab('learn')}>
            Learn
          </button>
          <button
            className={tab === 'dashboard' ? 'active' : ''}
            onClick={() => setTab('dashboard')}
          >
            Dashboard
          </button>
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
            AI Tutor Chat
          </button>
        </nav>
      </header>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'learn' && <Learn />}
      {tab === 'chat' && <Chat />}
    </div>
  )
}
