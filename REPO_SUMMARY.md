# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-29T13:36:32.201Z.

## Overview

Arena-embedded UI that turns a target keyword and client into writer-ready SEO article recommendations, with streaming-safe Unicode decoding, history view, and print-to-PDF output.

**Repository:** `article-recommendation-ui`  
**File count:** 31

## Features

- Keyword + client recommendation generator backed by the Arena workflow
- Global multi-pass Unicode escape decoder applied at every render boundary (streaming, JSON, history)
- Stage-based loading view with rotating tips and elapsed timer
- Structured model-output renderer with FAQ, sources and visual-opportunity cards
- Session + remote run history scoped to the Arena email
- Print-optimized PDF export of the rendered recommendation

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
- `/access-denied` — `app/access-denied/page.tsx`

## Database Models

- `RecommendationRun`

## File Inventory

### App pages

- `app/access-denied/page.tsx`
- `app/arena-ds-tokens.css`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`

### API routes

- `app/api/generate/route.ts`
- `app/api/history/route.ts`
- `app/api/recommend/route.ts`

### Components

- `components/BriefGeneratorClient.tsx`
- `components/ModelOutputRenderer.tsx`
- `components/RecommendationClient.tsx`
- `components/arena-email-provider.tsx`

### Libraries

- `lib/arena-email-constants.ts`
- `lib/arena-email.ts`
- `lib/modelOutput.ts`
- `lib/prisma.ts`
- `lib/textDecode.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
- `middleware.ts`
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
- `README.md`
- `REPO_SUMMARY.md`
- `app/access-denied/page.tsx`
- `app/api/generate/route.ts`
- `app/api/history/route.ts`
- `app/api/recommend/route.ts`
- `app/arena-ds-tokens.css`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `components/BriefGeneratorClient.tsx`
- `components/ModelOutputRenderer.tsx`
- `components/RecommendationClient.tsx`
- `components/arena-email-provider.tsx`
- `lib/arena-email-constants.ts`
- `lib/arena-email.ts`
- `lib/modelOutput.ts`
- `lib/prisma.ts`
- `lib/textDecode.ts`
- `lib/types.ts`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `prisma/schema.prisma`
- `tailwind.config.ts`
- `tsconfig.json`

## Latest Change

- **Updated at:** 2026-07-29T13:36:32.201Z
- **Request:** Fix the Unicode rendering issue across the entire application.

Problem:
When a user clicks any CTA button and the application enters the loading/streaming state, the UI displays Unicode escape sequences (for example \u201c, \u201d, \u2018, \u2019, \u2026, \u2013, \u2014) instead of the actual characters. This is visible in buttons, headings, sub-headings, paragraphs, labels, notifications, and other dynamically rendered text.

For example, the UI currently renders:

\u201cWelcome\u201d \u2014 Loading\u2026

Instead of:

“Welcome” — Loading…
Requirements
Identify where the escaped Unicode strings are entering the rendering pipeline.
Implement a single, reusable, global solution rather than fixing individual components.
Decode all valid \uXXXX Unicode escape sequences into their corresponding UTF-8 characters before they are rendered.
The solution must work for:
Streaming/SSE responses
WebSocket responses
API responses
Markdown rendering
Rich text
All React components that render dynamic content
Ensure decoding happens before the text is displayed so users never see the escaped values, even during streaming.
Do not hardcode replacements for only known characters; implement a generic Unicode escape decoder that supports any valid Unicode escape sequence.
Preserve existing formatting, Markdown, and HTML behaviour.
Ensure there are no performance regressions or unnecessary re-renders.
Common Examples
Escaped	Expected
\u201c	“
\u201d	”
\u2018	‘
\u2019	’
\u2026	…
\u2013	–
\u2014	—
Acceptance Criteria
No \uXXXX escape sequences are ever visible in the UI.
Buttons, headings, paragraphs, labels, and streamed content display the correct Unicode characters.
Streaming responses are decoded incrementally as they arrive.
API responses are decoded before rendering.
The implementation is centralised, reusable, and applied globally.
Existing functionality, formatting, and rendering behaviour remain unchanged.

Before making changes, identify the root cause of why escaped Unicode strings are reaching the UI instead of decoded text, then implement the fix at the appropriate layer rather than patching individual components.
