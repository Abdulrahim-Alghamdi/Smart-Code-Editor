# Smart Code Editor

A code editor that finds bugs in 21 languages and explains the fix in Arabic and English with AI.

Live: https://smartcode-editor.vercel.app

## What it does

- **Editor**: Monaco, with project tabs, import/export, version history (on the device) and a resizable review panel.
- **AI review**: sends the project's files to Gemini and shows bugs, root cause, fixes and suggestions in both languages. One click applies the fix, renames files, or creates suggested class files.
- **AI Assistant**: writes code from a description, inserted at the cursor or replacing the file.
- **Run**: HTML and JavaScript run in a sandboxed iframe (HTML previews pull in the project's own CSS and JS files), Python (Pyodide) and SQL (sql.js) in a Web Worker, and the compiled languages on a server: Wandbox for most, Compiler Explorer for Kotlin, Swift and Dart.
- **Share**: a link that carries the file itself, compressed in the URL's `#`, so it never reaches a server.
- **Accounts**: email, username, Google or GitHub sign-in. Files sync to the account, and drafts made offline upload when the connection returns.
- **Installable**: a PWA, so it can be added to a phone's home screen and opens offline.

AI features need a free account and are limited to **50 requests per user per day** (reviews and generations together), so one account can't drain the Gemini quota. Each user sees their usage under Manage account → Profile.

## Stack

React 19, TypeScript, Vite, Tailwind CSS 4, GSAP and Lenis on the front end. Supabase for auth, the database (with Row Level Security) and the Edge Functions. Vercel for hosting and `api/generate.ts`.

| Where | What |
|---|---|
| `src/App.tsx` | The page: header, editor, review panel, sign-in dialog |
| `src/appCopy.ts` | The page's Arabic and English text |
| `src/workspace/` | Editor features: run, output, history, share, preview, AI assistant |
| `src/account/` | Account dialog, profile, settings, usage |
| `supabase/functions/` | `gemini` (review), `run` (compile and run), `login` (username sign-in) |
| `supabase/migrations/` | Tables, RLS and functions, in order |
| `api/generate.ts` | AI Assistant (Vercel function) |

## Develop

```bash
npm install
npm run dev
```

`npm run dev` doesn't serve `/api`; use `npx vercel dev` to try the AI Assistant locally. Put `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and (for `/api`) `GEMINI_API_KEY` in `.env`.

```bash
npm test
npm run lint
npm run build
```

## Deploy

Pushing to `main` deploys the site on Vercel. Database migrations and Edge Functions deploy separately; see [MANUAL_STEPS.md](MANUAL_STEPS.md).
