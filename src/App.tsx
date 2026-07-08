import { type FormEvent, useEffect, useRef, useState } from 'react'
import PixelBlast from './components/PixelBlast.jsx'
import BorderGlow from './components/BorderGlow.jsx'
import SplitText from './components/SplitText.jsx'
import './App.css'

interface SpeechRecognitionResultEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const languages = {
  en: {
    label: 'EN',
    speechCode: 'en-US',
    brandAria: 'Voice AI home',
    navAria: 'Main navigation',
    nav: ['Solution', 'Research', 'Use cases', 'Pricing'],
    signIn: 'Sign in',
    bookDemo: 'Book a demo',
    startFree: 'Start for free',
    eyebrow: 'Voice AI Demo',
    prompts: ["What's the weather?", 'Plan my day.', 'Summarize this.', 'Set a reminder.'],
    inputAria: 'Ask the voice assistant',
    placeholder: 'Ask me anything...',
    micIdle: 'Start voice input',
    micListening: 'Listening',
    ask: 'Ask',
    loading: '...',
    speak: 'Play voice',
    stopVoice: 'Stop voice',
    preparingVoice: 'Preparing voice',
    unsupported: 'Voice input works best in Chrome.',
    micBlocked: 'Microphone permission was blocked.',
    voiceMissed: 'Voice input did not catch that. Try again.',
    requestFailed: 'The assistant could not answer yet.',
    ttsFailed: 'Voice playback is not ready yet.',
  },
  zh: {
    label: '中文',
    speechCode: 'zh-CN',
    brandAria: '语音 AI 首页',
    navAria: '主导航',
    nav: ['解决方案', '研究', '使用场景', '价格'],
    signIn: '登录',
    bookDemo: '预约演示',
    startFree: '免费开始',
    eyebrow: '语音 AI 演示',
    prompts: ['今天天气怎么样？', '帮我安排今天。', '总结这段内容。', '提醒我一下。'],
    inputAria: '询问语音助手',
    placeholder: '问我任何问题...',
    micIdle: '开始语音输入',
    micListening: '正在聆听',
    ask: '提问',
    loading: '...',
    speak: '播放语音',
    stopVoice: '停止语音',
    preparingVoice: '正在生成语音',
    unsupported: '语音输入建议使用 Chrome。',
    micBlocked: '麦克风权限被阻止。',
    voiceMissed: '没有听清楚，请再试一次。',
    requestFailed: '助手暂时无法回答。',
    ttsFailed: '语音播放暂时不可用。',
  },
} as const

type Language = keyof typeof languages

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const apiPath = (path: string) => `${apiBaseUrl}${path}`

const handleAnimationComplete = () => {
  console.log('All letters have animated!')
}

function App() {
  const [promptIndex, setPromptIndex] = useState(0)
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [language, setLanguage] = useState<Language>('en')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const copy = languages[language]
  const currentPrompt = copy.prompts[promptIndex % copy.prompts.length]
  const displayedResponse = error || reply
  const canSpeakReply = Boolean(reply && !error)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPromptIndex((index) => (index + 1) % copy.prompts.length)
    }, 3200)

    return () => window.clearInterval(intervalId)
  }, [copy.prompts.length])

  useEffect(() => {
    return () => {
      stopVoice()
    }
  }, [])

  function stopVoice() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }

    setIsSpeaking(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const content = message.trim()
    if (!content || isLoading) return

    setIsLoading(true)
    setReply('')
    setError('')
    stopVoice()

    try {
      const response = await fetch(apiPath('/api/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: content }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || copy.requestFailed)
      }

      setReply(data.reply || 'No reply returned.')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : copy.requestFailed,
      )
    } finally {
      setIsLoading(false)
    }
  }

  function handleVoiceInput() {
    const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognitionApi) {
      setError(copy.unsupported)
      return
    }

    const recognition = new SpeechRecognitionApi()
    recognition.lang = copy.speechCode
    recognition.continuous = false
    recognition.interimResults = true

    setReply('')
    setError('')
    setIsListening(true)

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join('')
        .trim()

      if (transcript) {
        setMessage(transcript)
      }
    }

    recognition.onerror = (event) => {
      setError(
        event.error === 'not-allowed'
          ? copy.micBlocked
          : copy.voiceMissed,
      )
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.start()
  }

  async function handleSpeak() {
    const content = reply.trim()
    if (!content || isSynthesizing) return

    if (isSpeaking) {
      stopVoice()
      return
    }

    stopVoice()
    setError('')
    setIsSynthesizing(true)

    try {
      const response = await fetch(apiPath('/api/tts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: content, language }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || copy.ttsFailed)
      }

      const blob = await response.blob()
      const audioUrl = URL.createObjectURL(blob)
      const audio = new Audio(audioUrl)

      audioUrlRef.current = audioUrl
      audioRef.current = audio
      audio.onended = stopVoice
      audio.onerror = () => {
        stopVoice()
        setError(copy.ttsFailed)
      }

      await audio.play()
      setIsSpeaking(true)
    } catch (speechError) {
      stopVoice()
      setError(
        speechError instanceof Error
          ? speechError.message
          : copy.ttsFailed,
      )
    } finally {
      setIsSynthesizing(false)
    }
  }

  return (
    <main className="ai-demo-page">
      <div className="pixel-background" aria-hidden="true">
        <PixelBlast
          className=""
          style={{}}
          variant="square"
          pixelSize={4}
          color="#3e3e3e"
          patternScale={2}
          patternDensity={1}
          pixelSizeJitter={0}
          enableRipples
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          liquid={false}
          liquidStrength={0.12}
          liquidRadius={1.2}
          liquidWobbleSpeed={5}
          speed={0.5}
          edgeFade={0.25}
          transparent
        />
      </div>
      <header className="site-nav">
        <div className="site-nav-inner">
          <a className="brand" href="/" aria-label={copy.brandAria}>
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>Voice AI</span>
          </a>

          <nav className="nav-links" aria-label={copy.navAria}>
            <a href="#solution">{copy.nav[0]}</a>
            <a href="#research">{copy.nav[1]}</a>
            <a href="#use-cases">{copy.nav[2]}</a>
            <a href="#pricing">{copy.nav[3]}</a>
          </nav>

          <div className="nav-actions">
            <div className="language-toggle" aria-label="Page language">
              {(Object.keys(languages) as Language[]).map((languageKey) => (
                <button
                  key={languageKey}
                  className={language === languageKey ? 'is-active' : ''}
                  type="button"
                  aria-pressed={language === languageKey}
                  onClick={() => {
                    setLanguage(languageKey)
                    setPromptIndex(0)
                    setReply('')
                    setError('')
                    stopVoice()
                  }}
                >
                  {languages[languageKey].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="hero-content">
        <p>{copy.eyebrow}</p>
        <SplitText
          key={currentPrompt}
          text={currentPrompt}
          className="hero-title"
          delay={50}
          duration={1}
          ease="power3.out"
          splitType="chars"
          from={{ opacity: 0, y: 40 }}
          to={{ opacity: 1, y: 0 }}
          threshold={0.1}
          rootMargin="-100px"
          textAlign="center"
          tag="h1"
          onLetterAnimationComplete={handleAnimationComplete}
        />
        <BorderGlow
          className="assistant-input-glow"
          edgeSensitivity={30}
          glowColor="40 80 80"
          backgroundColor="#120F17"
          borderRadius={28}
          glowRadius={40}
          glowIntensity={1}
          coneSpread={25}
          animated={false}
          colors={['#c084fc', '#f472b6', '#38bdf8']}
        >
          <form className="assistant-input" onSubmit={handleSubmit}>
            <input
              type="text"
              aria-label={copy.inputAria}
              placeholder={copy.placeholder}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <button
              className={`icon-button ${isListening ? 'is-listening' : ''}`}
              type="button"
              aria-label={isListening ? copy.micListening : copy.micIdle}
              onClick={handleVoiceInput}
            >
              <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                <path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 0 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Z" />
                <path d="M5 11.5a7 7 0 0 0 14 0" />
                <path d="M12 18.5V22" />
              </svg>
            </button>
            <button className="send-button" type="submit" disabled={isLoading}>
              {isLoading ? copy.loading : copy.ask}
            </button>
          </form>
        </BorderGlow>
        <div className="assistant-response" aria-live="polite">
          {canSpeakReply ? (
            <button
              className={`assistant-response-text ${isSpeaking ? 'is-speaking' : ''}`}
              type="button"
              aria-label={
                isSynthesizing
                  ? copy.preparingVoice
                  : isSpeaking
                    ? copy.stopVoice
                    : copy.speak
              }
              onClick={handleSpeak}
              disabled={isSynthesizing}
            >
              {displayedResponse}
            </button>
          ) : (
            <span className="assistant-response-text">{displayedResponse}</span>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
