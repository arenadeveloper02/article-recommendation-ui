# Article Recommendation Agent

Turn a target keyword and client into writer-ready SEO article recommendations, streamed live from a workflow agent and rendered as clean recommendation cards.

## Features

- Streaming recommendations with live status updates
- Parsed cards with intent, difficulty, search volume, and word-count badges
- **Download as PDF** — exports all displayed recommendations as a clean, formatted PDF (jsPDF, fully client-side) named `article-recommendations-[keyword]-[client].pdf`
- Copy any recommendation as markdown
- Graceful error handling with retry

## Tech Stack

- Next.js ^15.3.3 (App Router), React ^19
- Tailwind CSS v3 + @tailwindcss/typography
- jsPDF for client-side PDF export
- Prisma + PostgreSQL (Neon on Vercel)

## Local Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`
3. `npm run dev`

## Deploy

Deployed on Vercel. The build runs `prisma generate && prisma db push && next build`; `DATABASE_URL` is injected by the Neon integration.
