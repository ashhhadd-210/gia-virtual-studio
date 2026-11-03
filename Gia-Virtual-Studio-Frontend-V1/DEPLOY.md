# GIA Virtual Studio — Frontend Deployment

Static-site deploy of the React + Babylon shell to **DigitalOcean App Platform**.
Veni asked for DO end-to-end (not Vercel). This is a build-and-serve static
site; no Node server, no SSR.

---

## 1. Pre-flight: env vars

Vite inlines `VITE_*` vars **at build time**. Whatever you set BEFORE
`vite build` runs is baked into the JS bundle. You cannot change the API URL
at runtime without rebuilding.

**Two ways to set them:**

| Where                         | When            | Pros                                         |
| ----------------------------- | --------------- | -------------------------------------------- |
| `.env.production` (in repo)   | Before `git push` | Reproducible. CI uses what's in the file.  |
| DO dashboard "Build-Time" env | After repo push | Override without commits. Easier to rotate. |

Recommended: use **DO dashboard build-time** env so the API URL isn't in git.
That keeps the repo portable and the URL swappable per environment.

**Required:**
- `VITE_BACKEND_API_URL` — e.g. `https://your-app.ondigitalocean.app` (no trailing slash)
- `VITE_STRIPE_PUBLISHABLE_KEY` — `pk_test_*` is fine for FREE_DEMO_MODE launch

---

## 2. DO App Platform setup

1. Connect repo `venetanaydenova-gif/Gia-Virtual-Studio-Frontend-V1` (or
   whichever repo holds the V1 React shell).
2. Resource type: **Static Site** (not Web Service — there's no server).
3. Build command: `npm install && npm run build`
4. Output directory: `dist`
5. Plan: **Starter ($0/mo Static)** — free static hosting, 100 GB bandwidth.
   No need for a paid tier for a static SPA.
6. Build-time env vars: paste `VITE_BACKEND_API_URL` and
   `VITE_STRIPE_PUBLISHABLE_KEY`. Mark Build-Time (not Run-Time — there's
   no run time on a static site, but DO insists on this toggle).
7. Region: same as backend (NYC1).

After deploy succeeds, DO gives you a URL like `https://walrus-app-XXXX.ondigitalocean.app`.

---

## 3. Wire back into the backend's CORS allowlist

The backend's `ALLOWED_ORIGINS` env var must include the frontend's deployed
URL or the browser will block every API call with a CORS error.

Open backend app in DO → Settings → App-Level Env Vars → edit `ALLOWED_ORIGINS`:

```
ALLOWED_ORIGINS=https://giafashionverse.com,https://www.giafashionverse.com,https://walrus-app-XXXX.ondigitalocean.app
```

Backend will restart automatically.

---

## 4. Custom domain (optional, do AFTER smoke tests pass)

DO → App → Settings → Domains → Add Domain → `giafashionverse.com`.
DO gives you a CNAME / A record. Add it in Namecheap DNS.
Wait 5-30 minutes for propagation. DO auto-provisions a Let's Encrypt cert.

Once custom domain is live, update backend `ALLOWED_ORIGINS` to include it
and remove the DO subdomain.

---

## 5. Smoke test (Veni's 9 checks)

After both backend AND frontend are deployed, run these in a fresh incognito:

1. `/health` returns 200 (backend up)
2. Frontend loads, no console errors, no CORS warnings
3. Sign up → OTP email arrives → enter OTP → `gia_token` written to localStorage
4. Sign in → `gia_token` present, profile visible
5. Showroom loads, hero mannequins render, no 404s for `/generated-designs`
6. Vote on a product → backend confirms, count increments
7. Add to collection → reappears under `/auth/me/collection`
8. Open GSNowGPT chat → send a message → response within 8s
9. Sign out → `gia_token` cleared

If any fail, check **DO → App → Runtime Logs** (backend) and browser console
(frontend). 95% of issues are env-var typos.

---

## 6. Previous developer URLs — confirmed dead

V1's `.env` had two commented backend URLs from a prior developer:

- `https://stingray-app-br2fk.ondigitalocean.app` — DNS unresolvable (probed 2026-05-26)
- `https://walrus-app-6ncfg.ondigitalocean.app` — DNS unresolvable (probed 2026-05-26)

Both apps appear to have been torn down. A fresh DO backend app must be
created. The `prod-deploy-prep` branch under
`venetanaydenova-gif/Gia-Backend-V5-Deploy` is ready to deploy; spec is in
that repo's `.do/app.yaml`.

---

## 7. Perf parity status

### Ported into V1 (this round)

- Tier classifier: full GIA `deviceLoadingProfile.js` — detects Intel Xe-LPG /
  Arc / ANGLE-Intel iGPUs and forces `desktopConstrained` tier. The
  `?lite=1` emergency flag works.
- `loadingScreen.js`: always-on GPU warmup (fixes the "smooth after 3 min"
  shader-compilation stutter); 5500 ms instead of 22000 ms post-preload ceiling.
- Floor `MirrorTexture` tier-gated (1024 → 384 on constrained, 3-frame
  refresh, blur 18 → 8) and disabled entirely on `?lite=1`.
- Per-pedestal `MirrorTexture`s gated on `enablePedestalReflections`
  (off on constrained).
- `maxSimultaneousLights` capped at 4/6/8 by tier.
- ClearCoat disabled on constrained (saves a full BRDF eval/pixel).
- GlowLayer `mainTextureRatio` 1.0 → 0.4 and `blurKernelSize` 32 → 12 on constrained.
- Welcome / shop signs: 4096×1024 → 1024×256 on constrained (16× less GPU memory
  per sign) plus anisotropy 16 → 4.
- Engine options: `stencil: !constrainedPerformance`, `audioEngine: false`.
- Camera near/far tightened: `minZ` 0.04 → 0.12, `maxZ` 620 → 250 (depth precision).
- `perfOverlay.js` ported and wired in `StudioPage.jsx` — `?perf=1` shows live
  FPS / draws / textures / GPU memory.

### Cross-device responsive coverage

Mobile / tablet / iOS-Safari fixes applied alongside perf work:

- **Viewport meta**: added `viewport-fit=cover` (iPhone notch), `user-scalable=no`
  (canvas gestures don't fight pinch-zoom), iOS web-app meta tags.
- **iOS 100vh trap**: `#render-canvas` now uses `100dvh` (dynamic viewport
  height) with `100vh` fallback. URL bar appearing no longer pushes the
  canvas off-screen.
- **Safe-area-inset**: every fixed-position HUD overlay (mobile joystick,
  look hint, compass, desktop guide, corner-rotate arrows) now respects
  `env(safe-area-inset-*)` so they don't sit under the iPhone notch /
  Android gesture bar.
- **Sidebar chat overlap**: corner-rotate--right's hardcoded 360 px offset
  collapses below 900 px width — no longer pushed off-screen on tablets.
- **Horizontal overflow guard**: global `overflow-x: hidden` on `html/body`
  kills the "stray-wide-element causes sideways scroll" bug across all
  pages. Added a `.min-h-screen-dvh` utility class as the iOS-safe
  replacement for Tailwind's `min-h-screen`.
- **iOS text-zoom**: `-webkit-text-size-adjust: 100%` stops Safari from
  auto-resizing text in landscape (which misaligns Tailwind sizes).
- **Hero text scaling**: every `text-6xl`/`text-7xl` h1/h2 on HomePage,
  ExplorePage, Pricing now uses `text-3xl sm:text-4xl md:text-5xl lg:text-6xl`
  (or the 7xl variant) so 60-72 px text doesn't overflow 360 px phones.
- **Card padding/grids**: Pricing and ExplorePage cards drop from `p-12`
  to `p-6 sm:p-12`, gaps from `gap-8` to `gap-6 sm:gap-8`.
- **CTA buttons**: `px-10 py-5` on hero CTAs → `px-6 py-3 sm:px-10 sm:py-5`.
- Touch joystick + look-pad in `FirstPersonController` is already wired and
  visible on `pointer: coarse` devices.

### Still pending (low-priority follow-ups)

Each is independent and saves 5–15%. Not deploy blockers.

- `material.freeze()` for static materials once scene is at steady state.
- `scene.freezeActiveMeshes()` after welcome-screen dismiss.
- Shadow caster pruning on constrained (skip non-hero meshes).
- Welcome particles gated to visibility (currently always ticking).
- Critical mannequins demoted to streaming on constrained (only the spawn-line
  pair `z >= 138` stays critical).
- Center platform spotlights 6 → 2 on constrained.
- Shadow generator null-safe stub when `shadowMapSize === 0` (lite mode).

Useful local benchmarking: open the showroom with `?perf=1` and watch FPS.
Same machine + `?lite=1` gives the "no mirrors, no glow, no shadows" baseline
to confirm what's actually limiting you.
