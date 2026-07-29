# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-29T13:45:22.652Z.

## Overview

Article Recommendation Agent UI that turns a target keyword and client into writer-ready SEO article recommendations via the Arena workflow API, with streaming display, history, and PDF-friendly output.

**Repository:** `article-recommendation-ui`  
**File count:** 31

## Features

- Keyword + client recommendation generation via Arena workflow
- Defensive unicode/escape decoding of model output
- Structured model-output rendering (sections, FAQ, sources, visual opportunities)
- Run history (session + remote workflow history)
- Print/PDF-friendly output view
- Arena email gate with access-denied page

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

- **Updated at:** 2026-07-29T13:45:22.652Z
- **Request:** Bug report / fix prompt:

In the Article Recommendation Agent UI, unicode escape sequences are being rendered as literal text instead of their actual characters. Specifically:

The "Generating…" button shows Generating\u2026 instead of Generating…
The "Working on "Dental implants" for..." heading shows \u201c and \u201d instead of curly quotes " and "

This means somewhere a string containing raw \uXXXX escape sequences is being inserted into the DOM/JSX as plain text rather than being decoded first — likely because:

The string was JSON.stringify'd twice (double-encoding), or
A template/label string was defined with escaped unicode inside a raw/non-parsed string (e.g., a Python raw string, or a string read from a .json/.env/config file without proper decoding), or
The value came from an API response as an already-escaped string and is being displayed without JSON.parse or unescaping.

Please find where these strings originate (search for Generating, Working on, \u2026, \u201c, \u201d in the codebase) and fix the root cause so the actual Unicode characters (…, ", ") are stored/passed instead of their escaped representations. Do NOT just do a find-and-replace patch on the rendered output — trace it back to the source (likely a prompt template, static string constant, or API response parsing step) and fix it there.

A few things worth checking yourself first, since this narrows it fast:

If these are LLM-generated labels (the "Working on X for Y" text looks dynamically generated), check whether you're inserting the LLM's raw JSON string output directly into UI without running JSON.parse() on it.
If it's a static string like "Generating…", check if it's defined in a source file with an unusual encoding, or if it's being passed through JSON.stringify an extra time before rendering.

If you can share the component/file where "Generating…" and "Working on..." text is defined, I can point to the exact line.
