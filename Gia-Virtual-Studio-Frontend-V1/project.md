# GIA — Generative Intelligence Aesthetics

## Purpose

GIA is an AI-powered virtual fashion platform that combines real-time trend intelligence with generative AI to create, showcase, and crowdsource feedback on AI-generated fashion designs. It operates as a closed-loop ecosystem where user engagement (votes, likes, style queries) continuously feeds back into the AI generation pipeline.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI Framework | React | 19.2.4 |
| Build Tool | Vite | 8.0.10 |
| Routing | React Router DOM | 7.13.2 |
| 3D Engine (primary) | Babylon.js + Loaders | 8.56.1 |
| 3D Library (secondary) | Three.js | 0.183.2 |
| Animation | GSAP | 3.15.0 |
| Post-processing | Postprocessing | 6.39.1 |
| Styling | Tailwind CSS (Vite plugin) | 4.2.2 |
| Icons | Lucide React + React Icons | 1.7.0 / 5.6.0 |
| Audio | Howler.js | 2.2.4 |
| Payments | Stripe (checkout session) | — |
| Auth | Custom JWT (localStorage) | — |
| Backend | REST API (`VITE_BACKEND_API_URL`) | — |

---

## Project Structure

```
FrontendSupabase done/
├── src/
│   ├── main.jsx                    # Entry point — BrowserRouter + AuthProvider
│   ├── App.jsx                     # Route definitions
│   ├── index.css                   # Tailwind imports + custom scrollbar
│   │
│   ├── pages/
│   │   ├── ExplorePage.jsx         # Landing page with animated choice cards
│   │   ├── StudioPage.jsx          # 3D virtual showroom host
│   │   ├── Blog.jsx                # Fashion intelligence article grid
│   │   ├── BlogPost.jsx            # Individual blog post
│   │   ├── Auth.jsx                # Login / signup with OTP verification
│   │   ├── Pricing.jsx             # Subscription plan comparison
│   │   ├── PricingSuccess.jsx      # Post-checkout confirmation
│   │   ├── UserDashboard.jsx       # User stats, activity, voting, collection
│   │   └── AdminDashboard.jsx      # Admin quick actions & stats
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Navbar.jsx
│   │   │   ├── Footer.jsx
│   │   │   └── ScrollToTop.jsx
│   │   └── avatar/
│   │       ├── AvatarPicker.jsx
│   │       └── avatarData.js
│   │
│   ├── showroom/                   # 3D Virtual Showroom System
│   │   ├── ShowroomWorld.js        # Babylon.js scene orchestrator
│   │   ├── FirstPersonController.js # Camera & movement controller
│   │   ├── AudioManager.js         # Procedural audio + Howler ambient layer
│   │   ├── showroomAccessoryModels.js # Shoe/bag filename catalog + dimension data (URLs from backend)
│   │   ├── deviceLoadingProfile.js # Device capability detection
│   │   ├── loadingScreen.js        # Loading state management
│   │   ├── styles.css              # Babylon.js canvas styles
│   │   ├── showroom-ui.css         # HUD, panels, chat styles
│   │   └── components/
│   │       ├── HUD.jsx             # Compass, reticle, in-world guides overlay
│   │       ├── InspectPanel.jsx    # Item detail panel (vote, save, style)
│   │       ├── LoadingScreen.jsx   # Animated progress indicator
│   │       └── GSNowGPT/           # AI chat assistant
│   │           ├── index.jsx       # Panel container
│   │           ├── HomeView.jsx    # Initial menu
│   │           ├── ChatView.jsx    # Conversation UI + backend integration
│   │           ├── AgentsView.jsx  # Agent subscription grid
│   │           ├── FeaturesView.jsx
│   │           ├── SubscriptionView.jsx
│   │           └── data.js         # Agent catalog + mock responses
│   │
│   ├── Context/
│   │   └── AuthContext.jsx         # Auth provider (signup/login/logout/verify)
│   │
│   ├── Api/
│   │   └── api.js                  # 50+ centralized API endpoints
│   │
│   └── hooks/
│       └── useArticles.js          # Blog article fetching hook
│
├── ASSETS/
│   ├── Models/ManequinsRuntimeLOD/ # AI-generated fashion GLB models
│   │   ├── 1-Gold/                 # Premium tier designs
│   │   ├── 1-Silver/               # Standard tier designs
│   │   └── 2-Cream/                # Accessible tier designs
│   ├── Models/ShoesBagsShowroomWeb/ # AI-generated accessories
│   ├── Texture/                    # PBR material maps (albedo, metallic, normal)
│   ├── Generated/                  # AI-generated environment panels (WebP)
│   └── Fonts/                      # Three.js typeface JSONs
│
├── public/img/                     # Static logo & hero images
├── .env                            # VITE_BACKEND_API_URL, VITE_STRIPE_PUBLISHABLE_KEY
├── vite.config.js                  # Build config + Babylon.js manual chunking
├── package.json
└── index.html
```

---

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | ExplorePage | Landing with animated choice cards & stats |
| `/studio` | StudioPage | Immersive 3D fashion showroom |
| `/blog` | Blog | Paginated fashion intelligence articles |
| `/auth` | Auth | Login / signup with OTP email verification |
| `/pricing` | Pricing | Explorer / Creator / Studio plan comparison |
| `/pricing/success` | PricingSuccess | Stripe post-checkout confirmation |
| `/user/dashboard` | UserDashboard | User stats, activity feed, collection |
| `/admin/dashboard` | AdminDashboard | Admin controls & agent triggers |

---

## Core Features

### 3D Virtual Showroom (`/studio`)
- Babylon.js scene with PBR materials, spotlight & hemisphere lighting, shadow maps, glow post-processing
- All GLB assets fetched at runtime from the backend `GET /generated-designs` endpoint — mannequins, center-platform hero gowns, vitrine bags, and vitrine shoes. No GLB files are bundled locally.
- A single `fetchGeneratedDesigns()` call in `StudioPage.jsx` routes items into four buckets by filename: main-area gowns (3 pinned slots), bags, shoes, and the general mannequin pool. Accessories are excluded from the mannequin pool via `SHOWROOM_ACCESSORY_FILENAMES`.
- First-person navigation (free-look + orbit/inspect mode)
- Desktop (keyboard + mouse) and touch (virtual joystick + corner rotation buttons) control schemes
- Device performance profiling (`deviceLoadingProfile.js`) to scale quality accordingly
- HUD overlay: compass, contextual guides, interaction reticle
- InspectPanel: vote, save to collection, or query the AI assistant about any item

### AI Chat Assistant — GSNowGPT
- Embedded panel inside the 3D showroom
- Backend endpoint: `POST /gpt/query`
- 5 agents: Styling Agent, Trend Curation, Query Agent, Voting Agent, Proxy Voting Agent
- 10 free messages per free-tier user; unlimited for subscribers
- Context-aware pre-populated messages triggered by showroom actions (vote, style, similar look, save)
- Markdown rendering in responses

### Closed-Loop Feedback System
- Voting on designs (stored per product in backend)
- Proxy voting (automate voting decisions — requires subscription)
- Article likes and comments
- Personal collection / wardrobe saving
- Activity feed with timestamped history

### Authentication
- JWT stored in `gia_token` localStorage key
- User profile object cached in `gia_user`
- Multi-step OTP signup (email → code → profile)
- Token verified on app mount via `/auth/me`
- Admin flag gates access to `/admin/dashboard`

### Subscription & Payments (Stripe)
- `POST /subscription/checkout` → Stripe Checkout Session
- `POST /subscription/confirm` → activates plan in backend
- Plans: Explorer ($9–$89/mo), Creator ($29–$290/mo), Studio ($79–$790/mo)
- Premium features gated behind subscription status on both frontend and backend

### Blog / Content
- Articles fetched from backend with metadata (author, tags, images, sources)
- Pagination, comments, likes
- Like counts deterministically seeded from article ID (20–80 range) for visual consistency
- Markdown-rendered article bodies

---

## API Layer (`src/Api/api.js`)

All requests go through a centralized wrapper using the `fetch` API with Bearer token headers. Key endpoint groups:

| Group | Endpoints |
|-------|-----------|
| Auth | `/auth/signup`, `/auth/login`, `/auth/me`, `/auth/activity`, `/auth/stats` |
| Articles | `/articles/`, `/articles/:id/comments`, `/articles/:id/like` |
| Products | `/products/vote`, `/products/collection`, `/products/similar` |
| Designs | `/designs/` (generated fashion items) |
| GPT/Agent | `/gpt/query` |
| Subscription | `/subscription/checkout`, `/subscription/confirm` |
| Admin | Admin-specific trigger endpoints |

Backend URL configured via `VITE_BACKEND_API_URL` (default: `http://127.0.0.1:8000`).

---

## External Services

| Service | Role |
|---------|------|
| Backend REST API | Core data, auth, AI agents, design catalog |
| Stripe | Subscription checkout & confirmation |
| OpenAI (via backend) | Chat completions for GSNowGPT |
| Stability AI (via backend) | AI fashion design image/model generation |
| Supabase (backend) | Database & possibly auth backend |

---

## State Management

```
AuthContext  →  JWT + user profile (localStorage)
     ↓
api.js  →  REST calls with Bearer tokens
     ↓
Component useState  →  local UI state
     ↓
ShowroomWorld.js  →  Babylon.js scene state
     ↓
GSNowGPT  →  chat history + agent context
```

No Redux or Zustand — React Context API is sufficient for the auth layer; all other state is local.

---

## Styling

- Dark theme throughout: `#020617`, `#080e1f`, `slate-950`
- Neon/gradient accents: indigo, violet, cyan, emerald
- Tailwind CSS 4 utility classes + custom CSS for showroom-specific UI
- Two dedicated CSS files for the 3D environment: `styles.css` (canvas) and `showroom-ui.css` (HUD/panels/chat)

---

## Build & Configuration

- **Vite manual chunks**: Babylon.js isolated into its own chunk to prevent `Class extends value undefined` errors caused by circular dependency resolution order
- **Tailwind Vite plugin**: Zero-config CSS processing
- **ESLint 9**: React hooks + refresh plugins
- **PostCSS + Autoprefixer**: Browser compatibility for CSS

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_BACKEND_API_URL` | Backend REST API base URL |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe client-side key for checkout |

---

## Key Architecture Decisions

1. **Babylon.js as primary 3D engine** — chosen over Three.js for better performance with the mannequin/showroom workload; Three.js kept as secondary for specific effects.
2. **Dynamic GLB loading** — all GLB assets (mannequins, main-area gowns, vitrine bags, vitrine shoes) are fetched at runtime from the backend `generated_designs` endpoint; nothing is bundled locally, enabling the catalog to update without frontend deploys.
3. **Procedural audio** — `AudioManager.js` synthesizes sounds programmatically rather than serving audio files, reducing bundle size.
4. **OTP authentication** — email-based one-time password flow for frictionless signup without passwords.
5. **Deterministic seeding** — blog like counts derived from article ID so they appear consistent across sessions without real-time counting.
6. **Device profiling** — `deviceLoadingProfile.js` scales hardware pixel ratio, shadow quality, and asset LOD based on detected device capability.
7. **Context API over Redux** — auth state is the only global state; everything else is local to components, keeping the bundle lean.

---

## Showroom: Known Issues & Fixes Applied

### Issue 1 — Center Platform Showing Accessories Instead of Gowns (Fixed)

**Root cause:** The three center-platform mannequin slots (`z=86`, the "main area") were drawing from the same sequential URL pool as the corridor mannequins. Accessory GLBs (bags and shoes) existed in both the old local `showroomAccessoryModels.js` imports and in the Supabase `generated_designs` table, so they appeared in the URL pool and landed on the center mannequins.

**Fix applied (current state — all assets from backend):**

`showroomAccessoryModels.js` was fully rewritten:
- All local `?url` Vite imports removed (the `ASSETS/Models/ShoesBagsShowroomWeb/` folder does not exist locally).
- Now exports `SHOWROOM_BAG_FILENAMES` (11 entries), `SHOWROOM_SHOE_FILENAMES` (8 entries), and `SHOWROOM_ACCESSORY_FILENAMES` (combined Set of all 19).
- Dimension getters (`getShowroomBagMaxDimension`, `getShowroomShoeMaxDimension`) now key by filename extracted from the URL instead of by the full Vite-resolved path, so they work with backend URLs.

`StudioPage.jsx` single-pass fetch routing:
- One `fetchGeneratedDesigns()` call routes every item to one of four buckets based on filename matching: `mainAreaModelUrls` (3 pinned gowns), `bagModelUrls`, `shoeModelUrls`, or `designModelUrls` (general mannequin pool).
- `SHOWROOM_ACCESSORY_FILENAMES` is the authoritative exclusion set — accessories are automatically kept out of the mannequin pool with no hardcoded list in `StudioPage.jsx`.
- `MAIN_AREA_FILENAMES` pins the 3 center-platform gowns in slot order; missing gowns (not yet in DB) are dropped gracefully.

`ShowroomWorld.js` constructor:
- Signature: `constructor(scene, designModelUrls, mainAreaModelUrls, accessoryModelUrls = {})`.
- 4th arg is `{ bags: string[], shoes: string[] }` — replaces the old static `SHOWROOM_BAG_MODEL_URLS` / `SHOWROOM_SHOE_MODEL_URLS` imports.
- `_showroomBagUrlPool` and `_showroomShoeUrlPool` are seeded from these arrays.

---

### Issue 2 — Random Mannequins Disappearing on Each Load (Partially Fixed)

**Root cause:** `preloadAllDeferredAssets` ran up to 8 concurrent `SceneLoader.ImportMeshAsync` calls simultaneously. At that concurrency level Babylon.js hits internal race conditions in its material/texture deduplication and mesh-naming subsystems, causing some imports to silently resolve with zero renderable meshes — the slot is left empty with no error thrown.

**Fix 1 — GLB semaphore (applied):**
- Added `_glbSlotActive`, `_glbSlotMax = 2`, `_glbSlotQueue = []` to the constructor.
- `_acquireGlbSlot()` / `_releaseGlbSlot()` implement a correct transfer-semantics async semaphore (when a waiter is woken the count does not change; only decremented when the queue is empty).
- Both `_loadMannequinModel` and `_loadShowroomAccessoryGlb` wrap their `SceneLoader.ImportMeshAsync` call in `await this._acquireGlbSlot()` / `this._releaseGlbSlot()` (in a `finally` block).

**Fix 2 — Retry loop with backoff (applied):**
- `_loadMannequinModel` now loops up to `MAX_RETRIES = 2` extra attempts (3 total).
- Each retry creates a fresh `TransformNode` model root (disposes the failed one) and waits `600ms × attemptNumber` before retrying.
- Same pattern applied to `_loadShowroomAccessoryGlb`.

**Fix 3 — Post-preload repair pass (applied, issue persists):**
- `ShowroomWorld.js` constructor: `this._mannequinRepairSlots = []`.
- `_createMannequin`: Every slot that schedules a real GLB load pushes `{ root, yaw, targetHeight, resolvedModelUrl, platformTopY, showcaseTarget }` to `_mannequinRepairSlots`.
- `repairMissingMannequins()`: After preload, filters slots where the `root` TransformNode has no child named `*-model-root` (proof the load never produced geometry), then sequentially re-attempts each via `_loadMannequinModel`.
- `loadingScreen.js`: Calls `world.repairMissingMannequins()` after `preloadAllDeferredAssets` completes and before `freezeForRuntime`.

**Status:** Significantly improved after Fix 1 + 2. Fix 3 (repair pass) is in place but some mannequins are still reported as missing after full load. Further investigation needed — likely candidates:
- The repair pass detection (`*-model-root` child check) may not fire correctly if `_loadMannequinModel` attaches the node before failing on mesh import (the node gets disposed on failure, so detection should work — but worth verifying with console logging).
- The semaphore `_glbSlotMax = 2` may still be too high for the target device; reducing to `1` on constrained devices is an option.
- Some models may be genuinely unreachable (broken Supabase URL, CORS, expired signed URL) — in that case the slot fails all 3 attempts and the repair pass also fails all 3 retries, leaving it permanently empty.
- `getChildTransformNodes(true)` traversal depth — if the model root is nested differently than expected, the check returns a false negative.

**Recommended next steps:**
1. Add `console.log` in `repairMissingMannequins` to print which slots are detected as missing and which URLs they are trying to load, to distinguish "repair ran but re-failed" from "repair never detected the slot."
2. Cross-check Supabase `generated_designs` table for entries with broken or expired `model_url` values.
3. Consider reducing `_glbSlotMax` to `1` on mobile/constrained profiles.
4. Consider a second repair pass or a visible placeholder mesh for permanently-failed slots.

Old session:
claude --resume 8b64e93b-a88e-49fa-abc7-76478e777bdf