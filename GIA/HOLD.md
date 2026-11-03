# GIA — PROJECT HOLD (Code Lockdown)

**Status:** HOLD ACTIVE — 2026-05-29
**Reason:** Client (Veni / @veni0004) pursuing access to deliverables ahead of acceptance/payment terms. All in-flight work is frozen on local machine until dispute is resolved.

This file is the single source of truth for what is held back, what has already left your machine, and what you still need to do in 3rd-party UIs.

---

## 1. What Veni already has (already out of your control)

| Surface | Where | What's there |
|---|---|---|
| `Gia-Backend-V5-Deploy` repo | `github.com/venetanaydenova-gif/Gia-Backend-V5-Deploy` (her account) | Only the 3 commits on `main` she already had. Your defensive work is on `prod-deploy-prep` branch and is **NOT pushed**. |
| `Gia-Virtual-Studio-Frontend-V1` repo | `github.com/venetanaydenova-gif/Gia-Virtual-Studio-Frontend-V1` (her account) | Whatever was on `main` before. Your LicenseGate commit is on `prod-deploy-prep` and is **NOT pushed**. |
| DigitalOcean account | her DO | Admin access — she can pause/resume/destroy the app and read all env secrets at will. |
| Supabase project `nfkzpyxvwxlxazvrprki` | her Supabase | Admin — owns the DB, the storage bucket, the service_role key. |
| Postgres URI | shared in conversation | She originated it; you can't revoke it. |
| Namecheap (`giafashionverse`) | shared creds | 2FA on her phone — she controls effective access. |

Conclusion: anything that already lives in those systems is hers. The lockdown is about what hasn't left your machine yet.

---

## 2. What is HELD on this machine (must NOT push)

| Repo | Branch / state | What's held |
|---|---|---|
| `Downloads/GIA/GIA` (TheCrysto/GIA) | working tree, 60+ uncommitted files | **Patches 1-23**: GPU detection fix for Core Ultra, perf overlay, 84-texture downsize (-49 MB), mirror tier-gating, mesh decimation outliers, clearcoat tier-gate, sign downsize, `?lite=1` kill switch, freezeForRuntime, picking throttle. ~110 MB of asset optimizations. **Sole copy lives here.** |
| `Downloads/Gia-Backend-V5-Deploy` | `prod-deploy-prep` (3 commits ahead of `origin/main`) | `requirements.txt` UTF-8 fix, `requirements-design.txt` split, `.env.example`, `DEPLOY.md` runbook, `.do/app.yaml`, optional playwright import patch. Without these the backend will fail to deploy on Linux. |
| `Downloads/Gia-Virtual-Studio-Frontend-V1` | `prod-deploy-prep` (1 commit ahead) | `LicenseGate.jsx` + App.jsx wiring — gates `/studio` until you flip `RELEASED = true`. |

**Push protection:** pre-push git hooks have been installed in all three repos. Any `git push` will be refused with an explanatory message until you delete `.git/hooks/pre-push` in that repo.

---

## 3. Things you must do in 3rd-party UIs (only you can)

These cannot be done from this machine — they need your GitHub / DO / Supabase / Fiverr session.

### GitHub
- [ ] **Make `TheCrysto/GIA` private** if it isn't already (Settings → Danger Zone → Change visibility → Make private). This is your repo — Veni doesn't own it.
- [ ] **Remove any collaborators** added to `TheCrysto/GIA` (Settings → Collaborators).
- [ ] **Revoke any personal access tokens** you may have given Veni or used in cross-account automation (Settings → Developer settings → PATs).
- [ ] **Audit Veni's repos** (`venetanaydenova-gif/Gia-Backend-V5-Deploy`, `venetanaydenova-gif/Gia-Virtual-Studio-Frontend-V1`) — confirm what's on `main`. If you stay listed as a collaborator that's fine; just don't push.
- [ ] Decide: leave your name on Veni-owned repos' commit history (CYA evidence you did the work) or step away. Recommendation: **leave it** — your commits are proof of work for any Fiverr dispute.

### DigitalOcean
- [ ] If the deployed `sea-lion-app-pytlw.ondigitalocean.app` is on **your DO account**: pause it (App → Settings → Destroy or Suspend). If it's on **Veni's DO**: you have no leverage — skip.
- [ ] Revoke any DO API tokens you generated for this project (API → Tokens) so a leaked token can't be replayed.

### Supabase
- The Supabase project is hers. You can't rotate her keys from your side.
- [ ] If you have a personal Supabase account holding any GIA work: revoke its access tokens.

### Fiverr
- [ ] Open dispute / pause delivery on the Fiverr order. Document the state of work in the order chat. **Do not** mark delivered. Reference this HOLD.md by paste.
- [ ] Save a copy of all Fiverr DMs (Settings → Download conversation) before any account state changes.

### Local
- [ ] Back up `Downloads/GIA/` to an offline drive (the patches here are your sole leverage and ~110 MB total).
- [ ] Do **not** sync `Downloads/` to any cloud drive (OneDrive, iCloud) that auto-shares.

---

## 4. How to lift the hold (once paid)

1. Delete `.git/hooks/pre-push` in each repo (`GIA/GIA`, `Gia-Backend-V5-Deploy`, `Gia-Virtual-Studio-Frontend-V1`).
2. In `Gia-Virtual-Studio-Frontend-V1/src/components/LicenseGate.jsx`: flip `RELEASED = true`.
3. Commit the GIA showroom working-tree changes, then push to TheCrysto/GIA.
4. Push `prod-deploy-prep` branches to `main` on backend + V1 (or merge via PR if collaboration resumes).
5. DigitalOcean auto-deploys on push to `main` (per `.do/app.yaml: deploy_on_push: true`).
6. Delete this HOLD.md.

---

## 5. Communication template for Veni (Fiverr)

> Hi Veni — work on the GIA optimization + deploy package is complete on my side (Patches 1-23, backend deploy prep, frontend LicenseGate). I'm holding the final push pending the order being marked complete on Fiverr per our agreed completion-paid terms. Happy to walk you through any of the work on a short call once that's settled — would Tuesday or Wednesday work?

(Adjust tone to your style. Keep all dispute communication on Fiverr, not Telegram/DM — Fiverr's record is what protects you in a dispute.)

---

*Generated 2026-05-29 as part of code-lockdown procedure. Update whenever the hold state changes.*
