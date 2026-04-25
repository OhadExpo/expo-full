# expo-il

Landing page / sales site for EXPO programmed-training templates.
Lives at **expo-il.co.il** (separate domain from the trainer/client portal at `expo-app.co.il`).

This is intentionally a separate Vite project from the main `expo-full` app so:
- It can be deployed independently (faster iteration without rebuilding the app).
- A future site expansion (about, blog, gym page) doesn't pull on the portal codebase.
- The app's PWA service worker doesn't accidentally serve marketing pages.

---

## Run locally

```bash
cd expo-il
npm install
npm run dev    # http://localhost:5174
```

`npm run build` emits `dist/`. Preview with `npm run preview`.

---

## Editing the program catalog

`src/programs.js` is the single source of truth. Each program has:

- `id` — slug, e.g. `'hypertrophy-16'`
- `tag` — chip label (drives the filter pills)
- `title`, `duration`, `audience`, `summary`
- `highlights` — 2–4 bullet points
- `price`, `currency` (default `NIS`)
- `accent` — hex colour for the card border + price chip

Adding/removing programs needs no DB migration on the catalog side.
After purchase (Phase 1 = manual), Ohad creates the trainee row in
the coach portal and duplicates the matching template plan onto them.

---

## Contact + payment

`src/theme.js` exports a `CONTACT` constant with placeholders:

```js
{
  whatsapp: '972500000000',   // wa.me format — digits only
  bitPhone: '050-000-0000',
  email: 'ohadyproductions@gmail.com',
  instagram: 'https://www.instagram.com/',
}
```

Swap in the real values before the site goes live.

---

## Going live (DNS + Vercel)

The Vercel project for the existing app already auto-deploys from this repo.
This subfolder needs a separate Vercel project pointed at `expo-il/`.

### One-time setup

1. **Create a new Vercel project**
   - `vercel.com → Add New → Project`
   - Pick the `expo-full` GitHub repo.
   - **Root Directory:** `expo-il`
   - Framework: Vite (auto-detected from `vercel.json`).
   - Build command, output dir, install command: leave defaults — `vercel.json` already pins them.
   - Deploy. You get a `*.vercel.app` URL — confirm the site loads correctly.

2. **Attach the domain**
   - Project → Settings → Domains → Add `expo-il.co.il` and `www.expo-il.co.il`.
   - Vercel shows the DNS records to set.

3. **DNS at the registrar (where you bought `expo-il.co.il`)**
   - Apex `expo-il.co.il`: A record → `76.76.21.21`
   - `www`: CNAME → `cname.vercel-dns.com`
   - (Or: ALIAS/ANAME at the apex if your registrar supports it — easier for SSL.)
   - SSL is auto-provisioned within ~5 min once DNS resolves.

4. **Verify**
   - Wait until `dig expo-il.co.il +short` returns the Vercel IP.
   - Hit `https://expo-il.co.il/` — landing page should load.
   - Confirm the "Buy" buttons open WhatsApp with the right pre-filled message.

### Subsequent deploys

`git push` to `master`. Vercel auto-builds and deploys both projects (the
main app and `expo-il`) in parallel.

---

## What's intentionally NOT here yet

- No backend / database. The catalog is static. Purchases go via WhatsApp.
- No analytics. Add Plausible or Vercel Analytics once there's traffic worth measuring.
- No blog / about / gym page. Will live as additional routes when the gym opens (3–4 months).
- No automatic onboarding. After payment, Ohad manually creates the trainee row in the coach portal.
- No translations. The page is bilingual where natural; full Hebrew/English split can come later if needed.
