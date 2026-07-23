# Article Recommendation Agent

A clean, single-page tool that turns a target keyword and client into writer-ready article recommendations, streamed live from an AI workflow and rendered as formatted Markdown.

## Features

- Keyword + Client form with inline client-side validation
- Server-side `/api/recommend` proxy — the workflow API key never reaches the browser
- Live streaming rendering (SSE/chunked) with a non-streamed JSON fallback
- Unicode escape sequences (e.g. `\u2013`) are decoded server-side, never shown raw
- Heartbeat/progress messages are routed into a live status chip (pulsing dot + elapsed time), kept out of the answer
- Animated gradient progress line while streaming, with `prefers-reduced-motion` support
- Markdown result card, loading skeleton, and on-brand error card with retry

## Tech Stack

- Next.js ^15.3.3 (App Router) + React ^19
- TypeScript (strict)
- Tailwind CSS v3 + @tailwindcss/typography
- react-markdown + remark-gfm
- Prisma + PostgreSQL (Neon on Vercel)

## Local Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`
3. `npm run dev` and open http://localhost:3000

## Deploy

Deploys on Vercel. The build script runs `prisma generate && prisma db push && next build`. `DATABASE_URL` is provided by the Neon integration.
