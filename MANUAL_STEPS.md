# Manual steps

The code changes are already in the repo. These steps happen outside it, in the Supabase and Vercel dashboards or the CLI, so they need to be done by hand. Do them in order. Each one says how to check it worked.

Project ref: `hyztzllvefbsdbqvqivs` · Live site: `https://smartcode-editor.vercel.app`

---

## 1. Database migrations

Skip any you have already run. Run them in the Supabase dashboard (**SQL Editor → New query**), pasting each file in this order:

| File | What it creates |
|---|---|
| `supabase/migrations/20261031000000_profiles.sql` | `profiles` table, RLS, sign-up trigger, `delete_own_account` |
| `supabase/migrations/20261031020000_function_privileges.sql` | Locks down who can call those functions (Security Advisor fix) |
| `supabase/migrations/20261031030000_projects_and_files.sql` | `projects` and `files` tables with RLS (cloud sync) |
| `supabase/migrations/20261031040000_username_login.sql` | Unique usernames, so you can sign in with a username |

Or all at once from the CLI:

```bash
npx supabase link --project-ref hyztzllvefbsdbqvqivs
npx supabase db push
```

**Check:** the last two files end with a verification query. Its result should show no `false` rows.

## 2. Edge Function secrets

The Gemini key lives only on the server. Get one at https://aistudio.google.com/apikey, then:

```bash
npx supabase secrets set GEMINI_API_KEY=your-key-here
npx supabase secrets set ALLOWED_ORIGINS="https://smartcode-editor.vercel.app,https://smart-code-editor-*-smart-code-editor-org.vercel.app,http://localhost:5173,http://localhost:3000"
```

The Output button runs Python, Java and the other compiled languages on Wandbox (https://wandbox.org), a free public service that needs no key, so there is nothing to set for it.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically. Don't set them.

**Check:** `npx supabase secrets list` shows `GEMINI_API_KEY` and `ALLOWED_ORIGINS`.

## 3. Deploy the Edge Functions

The Gemini proxy is the existing `gemini` function (`supabase/functions/gemini`). The app already calls it by that name, so there is no separate `gemini-proxy`. Redeploy both functions whenever `supabase/functions/` changes, including `_shared/cors.ts`:

```bash
npx supabase functions deploy gemini --project-ref hyztzllvefbsdbqvqivs
npx supabase functions deploy login --project-ref hyztzllvefbsdbqvqivs
npx supabase functions deploy run --project-ref hyztzllvefbsdbqvqivs
```

**Check:** sign in on the live site and click review. The answer should come back without a "request failed (404)" error. Then switch to Python and click **Output**: the example's output should appear.

## 4. Auth URLs

In the Supabase dashboard, go to **Authentication → URL Configuration**:

- **Site URL:** `https://smartcode-editor.vercel.app`
- **Redirect URLs:** add both
  - `https://smartcode-editor.vercel.app/**`
  - `http://localhost:5173/**`

**Check:** the confirmation and password-reset emails open the live site, not `localhost:3000`.

## 5. Google and GitHub sign-in

Both providers need this callback URL:

```
https://hyztzllvefbsdbqvqivs.supabase.co/auth/v1/callback
```

- **GitHub:** https://github.com/settings/developers → your OAuth App → **Authorization callback URL**.
- **Google:** https://console.cloud.google.com/apis/credentials → your OAuth client → **Authorized redirect URIs**. Also add `https://smartcode-editor.vercel.app` under **Authorized JavaScript origins**.

Then paste each provider's Client ID and Secret into Supabase under **Authentication → Sign In / Providers**.

**Check:** the Google and GitHub buttons in the sign-in dialog return you to the site signed in.

## 6. Vercel environment variables

In Vercel, open **Project → Settings → Environment Variables** and add these for Production and Preview:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://hyztzllvefbsdbqvqivs.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the **anon / publishable** key from Supabase → Project Settings → API |

For the AI code generator (`api/generate.ts`), also add this one. Keep it out of the browser bundle by never giving it a `VITE_` prefix:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | the same key as step 2, or a separate one to track this feature's usage |

Never add the service-role key here, and never add any secret under a `VITE_` name. Any `VITE_` variable is bundled into the public JavaScript.

`npm run dev` doesn't serve `/api`. To try the generator locally, put `GEMINI_API_KEY` in `.env` and run `npx vercel dev`.

Also delete the leftover `VITE_GEMINI_API_KEY` line from your local `.env`. The app no longer reads it, and the name means it would be published if any code ever did.

**Check:** the live site loads without the "Missing VITE_SUPABASE_URL" error in the browser console.

## 7. Deploy the site

Vercel builds every push to `main`:

```bash
git add -A
git commit -m "Version history, offline drafts, resizable panels"
git push origin main
```

**Check:** the Vercel dashboard shows the deployment as **Ready**. Then, on the live site, edit a file, wait a minute, edit again, and open **Versions** in the editor toolbar. You should see two entries.

---

## Not done, on purpose

- **Sandboxed `<iframe>` for live preview.** The app has no live preview and never runs user code; it only sends code for AI review. If you add a preview, render it in `<iframe sandbox="allow-scripts allow-modals" srcdoc={html}>` and never add `allow-same-origin` together with `allow-scripts`.
