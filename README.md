# Voice AI Demo

A lightweight AI practice demo for a personal portfolio: typed or spoken input goes to an OpenRouter language model, and the assistant reply can be played back through Baidu text-to-speech.

## What It Shows

- Vite + React interactive demo page
- React Bits visual effects: PixelBlast, BorderGlow, SplitText
- English / Chinese UI and speech-recognition modes
- OpenRouter chat completion through a local server proxy
- Baidu text-to-speech through a local server proxy
- Click the assistant reply text to play or stop voice output

## Local Development

Install dependencies:

```bash
pnpm install
```

Create `.env` from `.env.example`, then add your own keys:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=qwen/qwen3.5-flash-02-23

BAIDU_API_KEY=your_baidu_api_key_here
BAIDU_SECRET_KEY=your_baidu_secret_key_here
```

Run the frontend:

```bash
pnpm dev
```

Run the local API proxy:

```bash
pnpm api
```

Open:

```text
http://127.0.0.1:5173/
```

## Deployment Notes

GitHub Pages can host the static frontend, but it cannot safely run the API proxy because OpenRouter and Baidu credentials must stay server-side.

Recommended public setup:

1. Host the frontend with GitHub Pages.
2. Host `server.mjs` on a Node-capable service such as Render, Railway, Fly.io, or another backend host.
3. Set `VITE_API_BASE_URL` in the frontend build to the public backend URL.
4. Set `ALLOWED_ORIGIN` on the backend to the GitHub Pages URL.

Do not commit `.env` or any real API keys.
