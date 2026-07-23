# Article Recommendation Agent

A single-page Next.js App Router UI that turns a target keyword (plus an optional client/brand) into a writer-ready SEO content brief by calling a Sim workflow API through a server-side proxy and rendering the returned Markdown.

## Features

- Centered single-card interface — no site header, no footer
- Server-side API proxy (`app/api/generate/route.ts`) that keeps the workflow API key out of the browser bundle
- Animated loading state with rotating status messages and an elapsed-seconds counter for the 1–2 minute workflow run
- Defensive Markdown extraction that walks any workflow response shape and picks the longest brief-looking string
- Beautiful Markdown rendering via `react-markdown` + `remark-gfm` with Tailwind typography (headings, lists, tables, links opening in new tabs)
- Copy Markdown to clipboard (with 2s checkmark) and Download as `article-brief.md`
- Error alert with one-click retry

## Tech Stack

- Next.js ^15.3.3 (App Router) + React ^19
- TypeScript (strict)
- Tailwind CSS v3 + @tailwindcss/typography
- react-markdown + remark-gfm

## Local Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are required — the workflow endpoint and API key are configured server-side in `app/api/generate/route.ts`.

## Build

```bash
npm run build
npm start
```

## Deploy Notes

- The generate route sets `export const maxDuration = 300` so long-running workflow executions (60–120s) are supported on platforms that honor route-level max duration (e.g. Vercel).
- This app is stateless — no database or persistence layer is used.
