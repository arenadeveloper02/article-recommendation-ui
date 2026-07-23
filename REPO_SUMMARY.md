# Repository Summary: Article Recommendation Agent

> Auto-maintained by Sim Development. Last updated: 2026-07-23T09:52:19.517Z.

## Overview

Single-page Next.js App Router UI that proxies a Sim workflow API to generate writer-ready SEO content briefs from a target keyword, rendered as beautiful Markdown.

**Repository:** `article-recommendation-ui`  
**File count:** 20

## Features

- Centered card UI with keyword + optional client/brand inputs
- Server-side proxy route handler with hardcoded API key (never exposed to client)
- Defensive Markdown extraction from arbitrary workflow response shapes
- Animated loading state with rotating status messages and elapsed timer
- Error alert with retry
- Rendered Markdown brief with react-markdown + remark-gfm + Tailwind typography
- Copy Markdown and Download .md toolbar actions

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

- `AppSetting`

## File Inventory

### App pages

- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`

### API routes

- `app/api/generate/route.ts`

### Components

- `components/BriefGeneratorClient.tsx`

### Libraries

- `lib/prisma.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
- `.gitignore`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `tailwind.config.ts`
- `tsconfig.json`

### Other

- `README.md`
- `REPO_SUMMARY.md`

## Complete File Index

- `.env.example`
- `.gitignore`
- `README.md`
- `REPO_SUMMARY.md`
- `app/api/generate/route.ts`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `components/BriefGeneratorClient.tsx`
- `lib/prisma.ts`
- `lib/types.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `prisma/schema.prisma`
- `tailwind.config.ts`
- `tsconfig.json`

## Latest Change

- **Updated at:** 2026-07-23T09:52:19.517Z
- **Request:** Build a single-page Next.js App Router web app called "Article Recommendation Agent" that is a front-end UI for an existing SEO content-brief API.

CRITICAL LAYOUT RULE: Do NOT render any site header (no top navbar/logo bar) and do NOT render any footer. The page should be just the centered content card on a full-height background. No header, no footer at all.

=== WHAT THE APP DOES ===
The user enters a target keyword and an optional client/brand name, clicks "Generate Brief", and the app calls a backend workflow API that returns a Markdown SEO content brief. The app renders that brief in a clean, readable format.

=== API INTEGRATION (hardcode these) ===
The browser must NOT call the external API directly (CORS + secret key). Instead create a Next.js Route Handler at app/api/generate/route.ts (server-side) that proxies the request. Hardcode these values IN THE ROUTE HANDLER only (server side, never exposed to the client bundle):
- Endpoint: https://test-agent.thearena.ai/api/workflows/22222756-700a-464c-b643-a8c11e92e64b/execute
- Header: X-API-Key: sk-sim-amPAyUKDZNygmERaDmxwJBgkMabZvYXr
- Header: Content-Type: application/json

The route handler receives { keyword, client } from the client form, then POSTs to the endpoint with body {"keyword": <keyword>, "client": <client>, "stream": false} (use stream:false so we get a single JSON response, not SSE). Set a generous timeout (this workflow can take 60-120 seconds) — use fetch with no artificial short timeout and configure the route with `export const maxDuration = 300;` and `export const dynamic = 'force-dynamic';`.

The API response is a JSON object from a Sim workflow execution. The final content brief is Markdown text. Parse it defensively: the brief text may live at output.content, or data.output.content, or result, or the top-level content field, or nested inside the last block's output. Write a helper that walks the response object and extracts the longest Markdown-looking string (the one containing headings like '#' and 'H2'/'Writing Instructions'). Return { brief: <markdownString>, raw: <wholeResponse> } from the route handler. If no brief string is found, return the stringified JSON so nothing is lost.

=== UI / PAGE (app/page.tsx, client component) ===
A centered card (max-width ~820px) vertically and horizontally centered on the viewport, on a soft gradient background (subtle indigo/slate). Inside the card, top to bottom:
1. A title "Article Recommendation Agent" and a one-line subtitle "Turn a target keyword into a writer-ready SEO content brief." (This is IN the card, it is NOT a site header.)
2. A form with:
   - Text input labeled "Target Keyword" (required, placeholder e.g. "Dental implants").
   - Text input labeled "Client / Brand (optional)" (placeholder e.g. "42 North Dental").
   - A primary "Generate Brief" button (full width, indigo). Disable it while loading and when keyword is empty.
3. Loading state: when submitting, show an animated spinner plus rotating status text like "Researching competitors…", "Analyzing content patterns…", "Drafting your brief…", "Running quality checks…" (cycle every few seconds) so the 1-2 minute wait feels alive. Show an elapsed-seconds counter.
4. Error state: if the request fails, show a red error alert with a retry button.
5. Result state: render the returned Markdown brief beautifully using react-markdown + remark-gfm with Tailwind typography (prose) styling — proper H1/H2/H3, bold, lists, tables, and links open in new tabs. Above the rendered brief add a small toolbar with two buttons: "Copy Markdown" (copies raw markdown to clipboard, shows a checkmark for 2s) and "Download .md" (downloads the brief as article-brief.md). Below the toolbar show the keyword and client that were used as small tags/badges.

=== STYLING & QUALITY ===
- Use Tailwind CSS. Install and configure @tailwindcss/typography for the prose classes. Modern, clean, generous whitespace, rounded-2xl cards, subtle shadow, indigo accent color, good mobile responsiveness.
- Use react-markdown and remark-gfm for rendering (add them to dependencies).
- Handle empty/whitespace keyword by not submitting.
- No database needed — this app has no persistence, it is purely a stateless proxy + UI. Do NOT provision Prisma/Neon.

Deliver a polished, production-ready single-page app. Remember: NO site header and NO footer anywhere.
