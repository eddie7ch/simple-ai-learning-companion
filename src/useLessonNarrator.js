import { useEffect, useRef, useState } from 'react'
import { getAskAnswer } from './api.js'

const SpeechRecognitionAPI =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

// Quality hints first — browsers (especially Edge) expose genuinely natural-
// sounding "neural"/"online" voices for free; prefer those over robotic
// default system voices.
const QUALITY_HINTS = ['neural', 'online', 'natural']
const FEMALE_VOICE_HINTS = [
  'aria',
  'jenny',
  'michelle',
  'sara',
  'emma',
  'nancy',
  'female',
  'zira',
  'samantha',
  'victoria',
  'karen',
  'moira',
  'tessa',
  'fiona',
  'susan',
  'google uk english female',
  'google us english',
]

const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g
const SENTENCE_PAUSE_MS = 220
const HEADING_PAUSE_MS = 380

// Standard American/British/Australian/Canadian/NZ accents, in preference
// order — deliberately excludes other English locales (e.g. en-IN, en-ZA,
// en-PH) which read as an unexpected accent to most US-based listeners.
const LOCALE_PREFERENCE = ['en-us', 'en-gb', 'en-au', 'en-ca', 'en-nz']

function splitSentences(text) {
  return text.match(SENTENCE_SPLIT_RE) || [text]
}

function pickVoice(voices) {
  const isQuality = (v) => QUALITY_HINTS.some((h) => v.name.toLowerCase().includes(h))
  const isFemale = (v) => FEMALE_VOICE_HINTS.some((h) => v.name.toLowerCase().includes(h))
  const inLocale = (v, locale) => v.lang?.toLowerCase().startsWith(locale)

  for (const locale of LOCALE_PREFERENCE) {
    const match = voices.find((v) => inLocale(v, locale) && isQuality(v) && isFemale(v))
    if (match) return match
  }
  for (const locale of LOCALE_PREFERENCE) {
    const match = voices.find((v) => inLocale(v, locale) && isQuality(v))
    if (match) return match
  }
  for (const locale of LOCALE_PREFERENCE) {
    const match = voices.find((v) => inLocale(v, locale) && isFemale(v))
    if (match) return match
  }
  for (const locale of LOCALE_PREFERENCE) {
    const match = voices.find((v) => inLocale(v, locale))
    if (match) return match
  }

  return voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? voices[0] ?? null
}

/**
 * Reads a lesson aloud sentence by sentence with a natural, soothing voice —
 * pausing briefly between sentences and after headings so it flows like
 * someone explaining the material, not reading a block of text. Tracks which
 * word is currently being spoken (for read-along highlighting).
 *
 * Interruption is push-to-talk only (via askNow), not always-on background
 * listening — an always-on mic while speakers are playing the narration
 * reliably mishears the TTS's own voice as a question, derailing the
 * reading. Push-to-talk cancels the TTS before listening, so there's no
 * audio for the mic to mishear.
 */
export function useLessonNarrator(topic, lesson) {
  const [isReading, setIsReading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isAskListening, setIsAskListening] = useState(false)
  const [isAnswering, setIsAnswering] = useState(false)
  const [lastAnswer, setLastAnswer] = useState(null)
  const [error, setError] = useState(null)
  const [supported] = useState(
    () => typeof window !== 'undefined' && !!window.speechSynthesis && !!SpeechRecognitionAPI
  )

  // Read-along tracking: which chunk (0 = title/summary, 1..n = sections),
  // which phase within it ('heading' | 'content'), and the word range
  // (character offsets into that heading/content string) being spoken now.
  const [currentChunkIndex, setCurrentChunkIndex] = useState(-1)
  const [phase, setPhase] = useState(null)
  const [wordRange, setWordRange] = useState(null)

  const chunksRef = useRef([])
  const indexRef = useRef(0)
  const voiceRef = useRef(null)
  const askRecognitionRef = useRef(null)
  const stoppedRef = useRef(true)
  const answeringRef = useRef(false)
  const pauseTimerRef = useRef(null)

  useEffect(() => {
    if (!supported) return
    function loadVoices() {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length) voiceRef.current = pickVoice(voices)
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
  }, [supported])

  useEffect(() => {
    if (!lesson) return
    chunksRef.current = [
      { heading: lesson.title, content: lesson.summary },
      ...lesson.sections.map((s) => ({ heading: s.heading, content: s.content })),
    ]
  }, [lesson])

  useEffect(() => {
    return () => {
      stoppedRef.current = true
      askRecognitionRef.current?.stop()
    }
  }, [])

  function makeUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text)
    if (voiceRef.current) utterance.voice = voiceRef.current
    utterance.rate = 0.94
    utterance.pitch = 1.02
    return utterance
  }

  /** Speaks a list of sentence strings back-to-back with a short natural pause between each. */
  function speakSentenceQueue(sentences, baseOffsets, startIdx, onDone) {
    if (stoppedRef.current) return
    if (startIdx >= sentences.length) {
      onDone()
      return
    }
    const sentence = sentences[startIdx].trim()
    const baseOffset = baseOffsets[startIdx]
    if (!sentence) {
      speakSentenceQueue(sentences, baseOffsets, startIdx + 1, onDone)
      return
    }
    const utterance = makeUtterance(sentence)
    utterance.onboundary = (e) => {
      setWordRange({
        start: baseOffset + e.charIndex,
        end: baseOffset + e.charIndex + Math.max(e.charLength || 1, 1),
      })
    }
    utterance.onend = () => {
      if (stoppedRef.current) return
      pauseTimerRef.current = setTimeout(() => {
        speakSentenceQueue(sentences, baseOffsets, startIdx + 1, onDone)
      }, SENTENCE_PAUSE_MS)
    }
    window.speechSynthesis.speak(utterance)
  }

  function sentenceStartIndexForOffset(sentences, baseOffsets, offset) {
    if (offset <= 0) return 0
    for (let i = 0; i < sentences.length; i++) {
      if (baseOffsets[i] >= offset) return i
    }
    return sentences.length - 1
  }

  function speakHeading(i, offset = 0) {
    const chunk = chunksRef.current[i]
    if (!chunk || stoppedRef.current) {
      stop()
      return
    }
    indexRef.current = i
    setCurrentChunkIndex(i)
    setPhase('heading')
    setWordRange(offset > 0 ? { start: offset, end: offset } : null)

    const text = `${chunk.heading.slice(offset)}.`
    const utterance = makeUtterance(text)
    utterance.pitch = 1.06
    utterance.onboundary = (e) => {
      setWordRange({
        start: e.charIndex + offset,
        end: e.charIndex + offset + Math.max(e.charLength || 1, 1),
      })
    }
    utterance.onend = () => {
      if (stoppedRef.current) return
      pauseTimerRef.current = setTimeout(() => speakContent(i), HEADING_PAUSE_MS)
    }
    window.speechSynthesis.speak(utterance)
  }

  function speakContent(i, offset = 0) {
    const chunk = chunksRef.current[i]
    if (!chunk || stoppedRef.current) {
      stop()
      return
    }
    indexRef.current = i
    setCurrentChunkIndex(i)
    setPhase('content')

    const sentences = splitSentences(chunk.content)
    const baseOffsets = []
    let cum = 0
    for (const s of sentences) {
      baseOffsets.push(cum)
      cum += s.length
    }
    const startIdx = sentenceStartIndexForOffset(sentences, baseOffsets, offset)
    setWordRange(offset > 0 ? { start: offset, end: offset } : null)
    speakSentenceQueue(sentences, baseOffsets, startIdx, () => speakHeading(i + 1))
  }

  function start() {
    seek(0, 'heading', 0)
  }

  /** Jump reading to a specific chunk/phase/char-offset — e.g. a clicked sentence. */
  function seek(chunkIndex, phase, offset = 0) {
    if (!supported || !chunksRef.current.length || !chunksRef.current[chunkIndex]) return
    stoppedRef.current = false
    answeringRef.current = false
    setIsReading(true)
    setIsPaused(false)
    setLastAnswer(null)
    setError(null)
    clearTimeout(pauseTimerRef.current)
    window.speechSynthesis.cancel()
    if (phase === 'heading') {
      speakHeading(chunkIndex, offset)
    } else {
      speakContent(chunkIndex, offset)
    }
  }

  function stop() {
    stoppedRef.current = true
    answeringRef.current = false
    clearTimeout(pauseTimerRef.current)
    window.speechSynthesis.cancel()
    askRecognitionRef.current?.stop()
    setIsReading(false)
    setIsPaused(false)
    setIsAnswering(false)
    setIsAskListening(false)
    setCurrentChunkIndex(-1)
    setPhase(null)
    setWordRange(null)
  }

  /**
   * Push-to-talk: explicitly click to ask a question. Cancels any TTS output
   * first so there's nothing for the mic to overhear, then listens once
   * (auto-submits after a pause in speech, same pattern as the Chat tab).
   */
  function askNow() {
    if (!supported || answeringRef.current) return
    clearTimeout(pauseTimerRef.current)
    window.speechSynthesis.cancel()
    setIsPaused(true)
    setIsAskListening(true)
    setError(null)

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    let transcript = ''
    let silenceTimer = null

    recognition.onresult = (event) => {
      transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('')
      clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => recognition.stop(), 1000)
    }
    recognition.onerror = (event) => {
      setError(`Microphone error: ${event.error}. Check that this site has mic permission.`)
    }
    recognition.onend = () => {
      clearTimeout(silenceTimer)
      setIsAskListening(false)
      const text = transcript.trim()
      if (text) {
        handleInterruption(text)
      } else if (!stoppedRef.current) {
        setIsPaused(false)
        speakHeading(indexRef.current)
      }
    }

    askRecognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      setIsAskListening(false)
    }
  }

  async function handleInterruption(question) {
    answeringRef.current = true
    clearTimeout(pauseTimerRef.current)
    window.speechSynthesis.cancel()
    setIsPaused(true)
    setIsAnswering(true)
    setError(null)

    try {
      const answer = await getAskAnswer(topic, lesson?.summary, question)
      setLastAnswer({ question, answer })

      const sentences = splitSentences(answer)
      let idx = 0
      const speakNext = () => {
        if (idx >= sentences.length) {
          answeringRef.current = false
          setIsAnswering(false)
          if (!stoppedRef.current) {
            setIsPaused(false)
            speakHeading(indexRef.current)
          }
          return
        }
        const utterance = makeUtterance(sentences[idx].trim())
        idx += 1
        utterance.onend = () => {
          if (stoppedRef.current) return
          pauseTimerRef.current = setTimeout(speakNext, SENTENCE_PAUSE_MS)
        }
        window.speechSynthesis.speak(utterance)
      }
      speakNext()
    } catch (err) {
      answeringRef.current = false
      setIsAnswering(false)
      setError(err.message)
    }
  }

  return {
    supported,
    isReading,
    isPaused,
    isAskListening,
    isAnswering,
    lastAnswer,
    error,
    currentChunkIndex,
    phase,
    wordRange,
    start,
    stop,
    seek,
    askNow,
  }
}
