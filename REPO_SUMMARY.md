# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-23T16:42:31.949Z.

## Overview

Article recommendation agent UI that turns a target keyword and client into writer-ready SEO article recommendations with streaming output, parsed recommendation cards, copy, and PDF export.

**Repository:** `article-recommendation-ui`  
**File count:** 22

## Features

- Streaming recommendation generation via workflow API
- Server-side decoding of escaped/double-stringified JSON payloads
- Parsed recommendation cards with badges, copy, and PDF export
- Markdown rendering with GFM support
- Robust error and retry handling

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

- `RecommendationRun`

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

- **Updated at:** 2026-07-23T16:42:31.949Z
- **Request:** The UI is displaying raw escaped JSON instead of decoded text. Example of what's currently shown on screen:

d \u201cdental implants\u201d \u00b7 client \u201c42 North Dental\u201d

This means a JSON string is being rendered before it's fully parsed — \u201c/\u201d are escaped curly quotes and \u00b7 is a middot, meaning the actual intended text is something like: dental implants" · client "42 North Dental".

Please find where the API response for the recommendations is fetched and rendered, and fix the parsing so the decoded string is displayed, not the raw/escaped JSON. Specifically:

1. Check whether the response is being read with response.text() and inserted directly into the DOM — if so, switch to response.json() (or JSON.parse() on the text) before rendering.
2. Check whether the backend is calling JSON.stringify() twice (i.e. stringifying an already-stringified payload) — if the parsed result is still a string containing escape sequences, add a second JSON.parse() to unwrap it, but ideally fix it at the source so double-stringification doesn't happen at all.
3. Check any place where JSON.stringify(someString) is used to build display text (e.g. element.textContent = JSON.stringify(data.recommendation)) instead of using the plain string value directly — remove the unnecessary stringify.
4. After the fix, confirm the rendered output shows real curly quotes (“ ”) and a real middot (·), not \u escape sequences, and that this works for all fields shown in the recommendation cards (title, rationale, keyword, client), not just the one currently broken.

Please show me the diff of what changed and briefly explain where the double-encoding was happening.


CRITICAL: DONT MAKE ANYCHANGES IN THE UI
