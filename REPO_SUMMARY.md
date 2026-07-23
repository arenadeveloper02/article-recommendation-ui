# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-23T10:43:58.677Z.

## Overview

A clean, single-page Article Recommendation Agent UI that streams writer-ready SEO article recommendations from a workflow API, with live status chips, markdown rendering, and graceful error handling.

**Repository:** `article-recommendation-ui`  
**File count:** 22

## Features

- Keyword + Client form with inline client-side validation
- Server-side /api/recommend proxy that keeps the API key out of the client bundle
- Live SSE/chunked streaming with progressive markdown rendering
- Heartbeat/status messages routed into a separate live status chip with elapsed time
- Unicode escape decoding so raw \uXXXX sequences never reach the user
- Non-streamed JSON fallback and on-brand error card with retry
- Responsive, minimal SaaS aesthetic with reduced-motion support

## Tech Stack

- Next.js ^15.3.3 (App Router)
- React ^19.0.0
- Tailwind CSS v3
- TypeScript
- Prisma + PostgreSQL (Neon on Vercel)

## Infrastructure

- **DATABASE_URL:** set on Vercel when Neon is connected — do not commit real credentials

## Routes & Pages

- `/` — `app/page.tsx`

## Database Models

- `RecommendationRequest`

## File Inventory

### App pages

- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`

### API routes

- `app/api/generate/route.ts`
- `app/api/recommend/route.ts`

### Components

- `components/BriefGeneratorClient.tsx`
- `components/RecommendationClient.tsx`

### Libraries

- `lib/prisma.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
- `next-env.d.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `postcss.config.mjs`
- `tailwind.config.ts`
- `tsconfig.json`

### Other

- `README.md`
- `REPO_SUMMARY.md`

## Complete File Index

- `.env.example`
- `README.md`
- `REPO_SUMMARY.md`
- `app/api/generate/route.ts`
- `app/api/recommend/route.ts`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `components/BriefGeneratorClient.tsx`
- `components/RecommendationClient.tsx`
- `lib/prisma.ts`
- `lib/types.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `postcss.config.mjs`
- `prisma/schema.prisma`
- `tailwind.config.ts`
- `tsconfig.json`

## Latest Change

- **Updated at:** 2026-07-23T10:43:58.677Z
- **Request:** Build a production-ready Next.js (App Router, TypeScript) application called "Article Recommendation Agent".

Layout constraints:

No header/nav bar, no footer. Just a clean, centered, single-page interface with a max-width container.
Modern, minimal SaaS aesthetic — not a generic AI-template look. Avoid the default "cream background + terracotta accent" or "black background + neon accent" clichés. Use a considered palette (e.g., off-white background, ink-navy text, an indigo/violet accent for primary actions), pair a distinctive display font for headings with a clean body font (e.g., Space Grotesk + Inter), and add one signature detail — like an animated gradient/progress line on the result card while streaming, and a live "elapsed time" status chip with a pulsing dot.
Fully responsive, rounded corners, subtle card shadows, good spacing, visible keyboard focus states, respects reduced-motion.

Form:

Two required text inputs: Keyword and Client.
A Get Recommendations submit button with disabled/loading state.
Client-side validation with clear inline error states (not just browser default).

API integration:

Create a server-side route handler at /api/recommend that proxies to:
Endpoint: https://test-agent.thearena.ai/api/workflows/22222756-700a-464c-b643-a8c11e92e64b/execute
Method: POST
Headers: { 'X-API-Key': 'sk-sim-amPAyUKDZNygmERaDmxwJBgkMabZvYXr', 'Content-Type': 'application/json' }
Body: { "keyword": <keyword>, "client": <client>, "stream": true }
The API key must be hardcoded server-side only — never exposed to the client bundle.
The client form calls only the local /api/recommend route.

Streaming handling:

Read the external response as a stream (SSE/chunked) and progressively render tokens as they arrive, so text appears live.
Also support a non-streamed JSON fallback gracefully.
Bug to fix: raw literal unicode escape sequences (e.g. \u2013) must never be shown to the user as text — they should always be decoded into real characters (e.g. an en dash), whether they arrive inside valid JSON or as double-escaped plain text.
Bug to fix: any heartbeat/progress/status messages from the stream (e.g. "This usually takes 1–2 minutes · 15s elapsed") must NOT be mixed into the rendered answer content. Detect and route these into a separate, subtle live status indicator/chip instead.

Rendering:

Render the final response as properly formatted Markdown (headings, bold, lists, links) using a markdown renderer, inside a well-styled result card.
Show a polished loading skeleton/spinner during streaming.
Show a clean, on-brand error card if the request fails, with a retry option.

Other requirements:
Clean, typed, production-quality code (proper component structure, error boundaries where relevant).
