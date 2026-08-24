# Deploying GPS4B v0.1

Deploying GPS4B means putting **three things** in place:

```
┌─────────────────┐     HTTPS      ┌─────────────────┐      ┌──────────────────────┐
│  Mobile app      │ ────────────▶ │  API server      │ ───▶ │  PostgreSQL + PostGIS │
│  (on riders'     │  POST /rides  │  (server/,       │      │  (central database)   │
│   phones)        │               │   Node/Express)  │      │                       │
└─────────────────┘               └─────────────────┘      └──────────────────────┘
```

1. A **PostgreSQL + PostGIS database** somewhere reachable by the server.
2. The **API server** running on a host with a public HTTPS address.
3. The **mobile app** built as a native binary and installed on phones.

The app records rides fully offline, so the backend being briefly down never
loses data — but phones need to reach the API eventually for rides to sync.

---

## 1. Requirements

### Accounts and costs

| What | Needed for | Cost |
|---|---|---|
| A server host (Hetzner, DigitalOcean, Lightsail, Fly.io, Railway, Render, …) | Running the API + database | ~$5–10/month for the smallest tier |
| A domain name (e.g. `gps4b.example.org`) | HTTPS for the API | ~$10/year |
| [Expo account](https://expo.dev) (free tier is fine) | EAS cloud builds of the app | Free (limited builds/month) |
| Apple Developer Program | Installing on iPhones (TestFlight) | $99/year |
| Google Play Console | Only if distributing via Play Store | $25 one-time |

For a **private prototype you can skip both store accounts on Android**:
EAS can produce an APK you install directly on your phone. iOS has no free
equivalent — running on an iPhone beyond 7 days requires the Apple Developer
Program (TestFlight is the practical route).

### Tools on your machine

- Node.js 20+ and npm
- `git`
- EAS CLI: `npm install -g eas-cli`
- Docker + Docker Compose on the server host (Option A below)
- For local iOS builds only (optional — EAS builds in the cloud): macOS + Xcode

### Non-negotiable: HTTPS

The spec requires encrypted uploads, and both platforms enforce it anyway
(iOS App Transport Security and Android's cleartext policy block plain
`http://` by default in release builds). Plan on a domain + TLS certificate;
the Caddy setup below makes this a two-line config.

---

## 2. Deploy the database + API

### Option A — one small VPS with Docker (recommended)

Everything on a single cheap Linux box. Perfectly adequate for v0.1 traffic
(a ride upload is one POST every few rides).

**1. Provision** an Ubuntu/Debian VPS, and install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

**2. Point DNS** at it: create an `A` record, e.g.
`gps4b.example.org → <server IP>`.

**3. Get the code onto the server** and set a real database password:

```bash
git clone https://github.com/ablack3/GPS4B.git
cd GPS4B/server
```

Edit `docker-compose.yml`: change `POSTGRES_PASSWORD` and the password inside
the `api` service's `DATABASE_URL` to a long random value. Also remove the
`db` service's `ports:` block (the API reaches it over the internal Docker
network; the database should not be exposed to the internet).

**4. Start the database and API:**

```bash
docker compose up -d --build
```

On first start the `postgis/postgis` image runs `schema.sql` automatically —
tables, PostGIS extension, and indexes are created for you.

**5. Put HTTPS in front** with Caddy (automatic Let's Encrypt certificates):

```bash
docker run -d --name caddy --network host \
  -v caddy_data:/data caddy:2 \
  caddy reverse-proxy --from gps4b.example.org --to localhost:3000
```

(Or install Caddy natively; the equivalent `Caddyfile` is
`gps4b.example.org { reverse_proxy localhost:3000 }`.)

**6. Verify from your laptop:**

```bash
curl https://gps4b.example.org/health
# {"status":"ok"}

curl -X POST https://gps4b.example.org/rides \
  -H 'Content-Type: application/json' \
  -d '{"ride_id":"ride_smoke_test","started_at":"2026-08-22T16:00:00Z",
       "ended_at":"2026-08-22T16:01:00Z",
       "points":[{"timestamp":"2026-08-22T16:00:05Z","latitude":42.36,
                  "longitude":-71.06,"condition":"GOOD"}]}'
# {"status":"stored","ride_id":"ride_smoke_test","point_count":1}

curl https://gps4b.example.org/rides/ride_smoke_test   # read it back
```

Run the POST twice — the second call should return `"already_synced"`
(idempotency working).

### Option B — Render (one-click Blueprint, recommended for no-ops setup)

`render.yaml` in the repo root describes the whole backend. In the
[Render](https://render.com) dashboard:

1. Sign up / log in (GitHub sign-in), and grant Render access to this
   repository (private repos work on the free tier).
2. **New + → Blueprint** → select the `GPS4B` repository → **Apply**.
3. Render provisions a free Postgres database and the `gps4b-api` web
   service (from `server/Dockerfile`), wires `DATABASE_URL`, and
   auto-deploys on every push. The server creates its own schema —
   including the PostGIS layer — on first startup, so there is nothing to
   run by hand.
4. Copy the service URL (`https://gps4b-api-….onrender.com`) and verify
   with the same `curl` checks as Option A, or run the E2E test in `e2e/`
   against it.

Free-tier caveats: the web service sleeps when idle (first request after a
pause takes ~30–60 s — harmless here, the apps queue and retry), and Render's
free Postgres instances expire after 30 days unless upgraded — export or
upgrade before then.

### Option C — other PaaS + managed Postgres

Same shape by hand: create a Postgres with PostGIS available
([Neon](https://neon.tech), [Supabase](https://supabase.com), Railway, AWS
RDS), deploy `server/` (the `Dockerfile` is auto-detected on Railway and
Fly.io), and set `DATABASE_URL`. The server bootstraps its schema at startup;
set `DATABASE_SSL=true` if the connection needs TLS and the URL doesn't make
that obvious.

### Backups

The raw observations are the product — back them up. Simplest cron job on
the VPS:

```bash
docker compose exec db pg_dump -U gps4b gps4b | gzip > backup-$(date +%F).sql.gz
```

Managed databases (Option B) usually do this for you.

---

## 3. Point the mobile app at your server

Edit `mobile/src/config.ts`:

```ts
apiUrl: 'https://gps4b.example.org',
```

This is baked into the app at build time, so set it **before** building.

---

## 4. Build and install the mobile app

`npx expo start` / Expo Go is for development only — **background location
does not work in Expo Go**, and nothing survives on a phone without a real
build. Deployment means native binaries, which EAS builds in the cloud (no
Mac needed, even for iOS).

One-time setup:

```bash
cd mobile
npm install -g eas-cli
eas login
eas init          # links the project to your Expo account (writes projectId)
```

Build profiles are already configured in `mobile/eas.json`.

### Android — direct install (simplest, no store)

```bash
eas build --platform android --profile preview
```

This produces an **APK**. Download it from the link EAS prints, open it on
the phone (or transfer via `adb install`), and allow installing from unknown
sources when prompted. Done — this is a perfectly good deployment for a
private prototype with a handful of riders.

For wider distribution use Google Play's **internal testing** track
(`eas build --profile production` then `eas submit -p android`). Note that a
*public* Play release of an app using `ACCESS_BACKGROUND_LOCATION` requires a
policy declaration and review — another reason to stay on internal
testing/APKs for v0.1.

### iOS — TestFlight

Requires the Apple Developer Program ($99/year).

```bash
eas build --platform ios --profile production
eas submit --platform ios
```

EAS walks you through credentials (it can create certificates and
provisioning profiles for you). After the build is submitted, add testers in
App Store Connect → TestFlight; they install via the TestFlight app. Internal
testers (up to 100) need no Apple review.

### First-run check on the phone

1. Open the app, press **START RIDE**.
2. Grant location permission — choose **"Allow all the time"** (Android) /
   **"Always"** (iOS) so recording survives the screen locking.
3. Confirm the point counter increases, lock the phone for a minute, unlock —
   the counter should have kept climbing.
4. Press **STOP RIDE** and confirm the ride uploads
   (`curl https://gps4b.example.org/rides/<id>` or check the database).

---

## 5. Shipping updates

- **JS-only changes** (UI, sync logic, config): rebuild and redistribute, or
  adopt [EAS Update](https://docs.expo.dev/eas-update/introduction/) later
  for over-the-air JS updates without reinstalling.
- **Native changes** (new Expo SDK, new native module, `app.json` permission
  changes): always require a new `eas build` and reinstall.
- **Server changes**: `git pull && docker compose up -d --build` on the VPS.
  The API is stateless — all state is in Postgres — so redeploys are safe;
  phones retry any upload that lands during the restart.
- **Schema changes**: `schema.sql` only runs on first database creation.
  Apply changes to an existing database manually
  (`psql "$DATABASE_URL" -c '...'`) and keep `schema.sql` in sync for fresh
  installs.

---

## 6. Deployment checklist

- [ ] Postgres + PostGIS running; `schema.sql` applied
- [ ] Database password changed from the default; DB port not exposed publicly
- [ ] API running; `GET /health` returns `ok` over **HTTPS**
- [ ] Smoke-test ride POSTs, retries idempotently, reads back
- [ ] Database backups scheduled
- [ ] `apiUrl` in `mobile/src/config.ts` set to the HTTPS URL
- [ ] `eas init` done; Android APK (and/or TestFlight build) produced
- [ ] Installed on a real phone; background recording verified with the
      screen locked; ride visible in the central database

---

## 7. The web app (GitHub Pages)

A browser version of the recording app lives in `web/` — plain HTML/JS, no
build step — and is deployed automatically to **GitHub Pages** at:

> https://ablack3.github.io/GPS4B/

The workflow `.github/workflows/deploy-pages.yml` publishes `web/` to the
`gh-pages` branch on every push that touches `web/`. GitHub Pages serves that
branch. If the site ever 404s, check the repo's **Settings → Pages** and set
Source to *Deploy from a branch* → `gh-pages` → `/ (root)` (a one-time
setting; the workflow keeps the branch updated after that).

The web app implements the same v0.1 flow: START RIDE → GOOD/BAD → STOP
RIDE, browser geolocation sampled at the configured interval
(`?interval=<ms>` overrides the 5 s default), offline-first storage in
IndexedDB, a retryable sync queue that uploads to any GPS4B server URL you
enter in *Rides & sync*, and JSON/CSV export as a server-free alternative.
It requests a screen wake lock while recording.

### Why the native app still matters

**The browser cannot record with the screen locked** — there is no
background geolocation API on the web; the OS suspends the page.

Expo can target the browser (`npx expo start --web` even mostly works for
this codebase — React Native components and `expo-sqlite` have web support),
but the browser platform itself imposes hard limits:

| Requirement | Native app | Web app (PWA) |
|---|---|---|
| GPS while app is open, screen on | ✅ | ✅ (`watchPosition`) |
| GPS with **screen locked / app in background** | ✅ | ❌ browsers suspend the page; no background geolocation API exists |
| Survives being closed mid-ride | ✅ SQLite + task manager | ❌ tab closed = recording gone |
| Install | APK / TestFlight | just a URL |

Background recording with the phone locked in a pocket is acceptance
criterion #6 and the core of the product. A web version would silently stop
recording seconds after the screen locks — worse than not existing, because
it *looks* like it works while producing truncated rides. Wake Lock APIs can
keep the screen on as a workaround, but burning the screen for a whole ride
defeats the battery goal and still dies on an accidental pocket-press.

**Where a web app *does* make sense** for GPS4B, later:

- A **data viewer/dashboard** — browse uploaded rides on a map, check data
  quality. Perfect fit for the web, no location APIs needed, and it talks to
  the same `GET /rides/:id` style endpoints.
- A **demo/simulator** build of the recording screen for trying the UI
  without installing anything.

Recommendation: keep recording native (it's one codebase either way — Expo
gives you iOS + Android from what's already written), and when you want to
*look at* the collected data, that's the moment to add a small web frontend.
