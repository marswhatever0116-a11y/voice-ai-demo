import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
let baiduTokenCache = null

function loadEnvFile() {
  if (!existsSync('.env')) return

  const lines = readFileSync('.env', 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue

    const [key, ...valueParts] = trimmed.split('=')
    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '')
    }
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'http://127.0.0.1:5173',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  res.end(JSON.stringify(data))
}

function sendAudio(res, audio, contentType) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'http://127.0.0.1:5173',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  res.end(Buffer.from(audio))
}

async function readJson(req) {
  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

async function getBaiduAccessToken() {
  if (process.env.BAIDU_ACCESS_TOKEN) {
    return process.env.BAIDU_ACCESS_TOKEN
  }

  if (baiduTokenCache && baiduTokenCache.expiresAt > Date.now() + 60_000) {
    return baiduTokenCache.token
  }

  const apiKey = process.env.BAIDU_API_KEY
  const secretKey = process.env.BAIDU_SECRET_KEY

  if (!apiKey || !secretKey) {
    throw new Error('Missing BAIDU_API_KEY or BAIDU_SECRET_KEY. Add them to .env first.')
  }

  const tokenUrl = new URL('https://aip.baidubce.com/oauth/2.0/token')
  tokenUrl.searchParams.set('grant_type', 'client_credentials')
  tokenUrl.searchParams.set('client_id', apiKey)
  tokenUrl.searchParams.set('client_secret', secretKey)

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  })
  const data = await response.json()

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Baidu token request failed.')
  }

  baiduTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 2_592_000) * 1000,
  }

  return baiduTokenCache.token
}

async function synthesizeSpeech(text) {
  const token = await getBaiduAccessToken()
  const body = new URLSearchParams({
    tex: encodeURIComponent(text.slice(0, 1000)),
    lan: 'zh',
    cuid: process.env.BAIDU_TTS_CUID || 'voice-ai-demo',
    ctp: '1',
    tok: token,
    aue: process.env.BAIDU_TTS_AUDIO_FORMAT || '3',
    per: process.env.BAIDU_TTS_VOICE || '0',
    spd: process.env.BAIDU_TTS_SPEED || '5',
    pit: process.env.BAIDU_TTS_PITCH || '5',
    vol: process.env.BAIDU_TTS_VOLUME || '5',
    audio_ctrl: JSON.stringify({ sampling_rate: 16000 }),
  })

  const response = await fetch('https://tsn.baidu.com/text2audio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'audio/mp3, application/json',
    },
    body,
  })
  const contentType = response.headers.get('content-type') || ''
  const audio = await response.arrayBuffer()

  if (!response.ok || !contentType.startsWith('audio')) {
    const errorText = Buffer.from(audio).toString('utf8')
    let errorMessage = errorText || 'Baidu speech synthesis failed.'

    try {
      const errorData = JSON.parse(errorText)
      errorMessage = errorData.err_msg || errorData.error_msg || errorMessage
    } catch {
      // Keep the raw response text if Baidu did not return JSON.
    }

    throw new Error(errorMessage)
  }

  return {
    audio,
    contentType,
  }
}

loadEnvFile()

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.url === '/api/tts' && req.method === 'POST') {
    try {
      const { text } = await readJson(req)
      const content = String(text || '').trim()

      if (!content) {
        sendJson(res, 400, { error: 'Text is required.' })
        return
      }

      const speech = await synthesizeSpeech(content)
      sendAudio(res, speech.audio, speech.contentType)
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      })
    }
    return
  }

  if (req.url !== '/api/chat' || req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free'

  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    sendJson(res, 500, {
      error: 'Missing OPENROUTER_API_KEY. Add it to .env first.',
    })
    return
  }

  try {
    const { message } = await readJson(req)
    const content = String(message || '').trim()

    if (!content) {
      sendJson(res, 400, { error: 'Message is required.' })
      return
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://127.0.0.1:5173',
        'X-OpenRouter-Title': process.env.OPENROUTER_SITE_NAME || 'Voice AI Demo',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a concise voice assistant. Answer in one or two short sentences. Reply in the same language as the user: Chinese input gets Chinese output, English input gets English output.',
          },
          {
            role: 'user',
            content,
          },
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      sendJson(res, response.status, {
        error: data?.error?.message || 'OpenRouter request failed.',
      })
      return
    }

    sendJson(res, 200, {
      model,
      reply: data?.choices?.[0]?.message?.content || '',
    })
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unexpected server error.',
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`OpenRouter proxy running at http://${HOST}:${PORT}`)
})
