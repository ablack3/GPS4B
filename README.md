# GPS4B

**Bike-safety navigation, mapped by the people who ride it.**

A nonprofit GPS app and civic feedback loop that routes Boston cyclists by
safety — then turns their ride data into real, community-funded
infrastructure.

`COMMUNITY-POWERED` · `501(c)(3) NONPROFIT` · `BOSTON, MA`

![GPS4B title slide](docs/slides/slide-1.png)

This repo currently ships **v0.1: the data-collection layer** — the GPS
recording, SAFE/UNSAFE annotation, storage, and sync engine the rest of the
vision is built on. The full pitch below is the roadmap; the "What's built
today" section further down is what actually runs.

## The pitch

### The problem

**Boston's streets were drawn for cars — and mapped for them too.**

![The problem](docs/slides/slide-2.png)

- **The network has gaps** — protected lanes start, stop, and vanish
  mid-block, dropping riders into traffic without warning.
- **GPS was built for driving** — Google Maps, Apple Maps, and Waze score
  every route like a car trip: shortest time, not safest street.
- **Local knowledge goes nowhere** — riders learn every hazard on their
  commute, but that knowledge never reaches whoever plans the next bike lane.

### The solution

**Introducing GPS4B** — turn-by-turn routing that scores safety like a local
rider would, because it's built from what local riders report.

![The solution](docs/slides/slide-3.png)

- **Safety-first routing** — navigation scored on protected lanes, traffic
  exposure, and rider-reported hazards, not just distance and speed.
- **Real-time hazard reporting** — riders flag lane gaps, potholes, blocked
  lanes, and near-misses in seconds, right from the app.
- **Mapped by Boston, for Boston** — routes and safety scores come from local
  riders, not a generic algorithm built for cars in another city.

### How it works

**Every ride teaches the map something new.**

![How it works](docs/slides/slide-4.png)

1. **Ride & report** — cyclists ride with GPS4B and flag hazards, gaps, and
   near-misses in real time.
2. **Data aggregation** — thousands of rider reports compile into a living
   map of Boston's bike network.
3. **Safety scoring** — every street segment is scored on protection, traffic
   exposure, and real rider experience.
4. **Optimized routes** — GPS4B routes each rider along the safest path, not
   just the fastest one.

### The GPS4B loop

**A feedback loop the community owns end to end.**

![The GPS4B loop](docs/slides/slide-5.png)

Ride & report → hazards & gaps identified → safer routes published →
community votes on priorities → donations fund projects → infrastructure
improved → back to riding it.

### Funding & governance

**Funded by riders. Directed by riders.** GPS4B is a nonprofit — every dollar
donated goes toward real infrastructure the community itself chooses.

![Funding and governance](docs/slides/slide-6.png)

1. **Donate** — riders and local supporters fund the improvement pool: no
   ads, no data sales, no investors to answer to.
2. **Propose & vote** — anyone can propose a project (a closed lane gap, a
   bad intersection, better signage), and members vote on what matters most.
3. **Build & verify** — top-voted projects get funded and built with city and
   community partners, then verified by riders on the ground.

*100% nonprofit · community-directed spending · open ledger*

### Our vision

**A Boston that's safer, block by block.** *By us, for us.*

![Our vision](docs/slides/slide-7.png)

- **Safer streets** — routes and real infrastructure fixes that reduce close
  calls and collisions for everyday riders.
- **A connected network** — gaps in the bike lane system get identified,
  prioritized, and closed, one funded project at a time.
- **Community ownership** — the people riding the streets decide what gets
  fixed next, not a distant algorithm or committee.
- **A healthier city** — more riders, fewer cars, cleaner air, and a more
  connected, active Boston for everyone.

### The ask

**Join the ride.** GPS4B only works if the community shows up.

![The ask](docs/slides/slide-8.png)

- **Ride & report** — download GPS4B, ride your usual routes, and flag the
  gaps and hazards you already know about.
- **Donate** — fund the improvement pool; every gift goes directly toward
  community-voted infrastructure.
- **Vote** — weigh in on which projects get built next in your neighborhood —
  your ride, your vote.

*Let's make every ride in Boston safer — together.*

### Team

![Team](docs/slides/slide-9.png)

A founding crew of Boston riders, engineers, and civic organizers, growing
with every volunteer who joins. Contact: **ablack3@gmail.com**.

The full interactive deck is in [`docs/pitch-deck.html`](docs/pitch-deck.html)
(open it in a browser — arrow keys / swipe to navigate).

---

## What's built today (v0.1)

GPS4B v0.1 records a rider's GPS location over time and lets the rider tag
the current portion of the ride as **SAFE** or **UNSAFE**. The goal at this
stage is data collection, not navigation: the phone is a sensor that
observes, annotates, stores, and syncs. Routing, hazard-scored maps, voting,
and funding (the rest of the pitch above) are downstream of having this data.

```
REAL WORLD → PHONE → GPS + HUMAN JUDGMENT → LOCAL STORAGE → SYNC → CENTRAL DATABASE
```

### Repository layout

```
mobile/   Expo (React Native + TypeScript) app for iOS and Android
server/   Minimal Node/Express backend + PostgreSQL/PostGIS schema
web/      Browser version (static PWA) — deployed to GitHub Pages
docs/     Pitch deck (docs/pitch-deck.html) and its slide screenshots
```

The web version is served at **https://ablack3.github.io/GPS4B/** (see
`.github/workflows/deploy-pages.yml`). It implements the same record →
annotate → store → sync flow using browser geolocation and IndexedDB, with
JSON/CSV export. One honest caveat: browsers stop GPS when the screen locks,
so for real rides with the phone in a pocket the native mobile app is the
tool; the web app is for trying GPS4B and short screen-on recordings.

Deploying to a real server and real phones is covered step-by-step in
[DEPLOYMENT.md](./DEPLOYMENT.md).

### Start using GPS4B — next steps

The fastest path from "code in a repo" to "recording real rides":

1. **Try the web app right now** at https://ablack3.github.io/GPS4B/, or run
   any static file server pointed at `web/` — the app runs entirely in the
   browser.
2. **Stand up the central server** (collects rides from all devices):
   sign in at [render.com](https://render.com) → **New + → Blueprint** →
   select this repo → **Apply**. Render reads `render.yaml` and creates the
   free Postgres database + the API; the server creates its own schema on
   first boot. Copy the service URL (`https://gps4b-api-….onrender.com`).
3. **Connect the web app to the server**: open the app → *Rides & sync* →
   paste the server URL → Save. Completed rides now upload automatically
   (with retry; nothing is lost offline).
4. **Record a ride**: press **START RIDE**, allow location access, ride,
   toggle **SAFE/UNSAFE** as conditions change, press **STOP RIDE**. The
   screen stays awake while recording (toggleable).
5. **Verify the data**: tap **Map** on any ride (or **Show live track**
   during a ride) to see the recorded points over OpenStreetMap, colored
   green/red by condition, with distance, duration, and GPS accuracy — the
   quickest way to confirm recording is working correctly. For the server
   side, `GET <server>/rides/<ride_id>` returns the stored ride, or query
   Postgres directly (`SELECT … FROM location_points WHERE ride_id = …`).
6. **When ready for pocket recording** (screen off, phone locked), build
   the native app in `mobile/` — see [DEPLOYMENT.md](./DEPLOYMENT.md) for
   the EAS build steps (Android APK needs no store account).

Automated end-to-end verification of all of this lives in `e2e/` —
`node test.js <appUrl> <apiUrl>` drives a real browser with mocked GPS
through record → annotate → store → sync → database.

### How it works

#### Mobile app (`mobile/`)

A single-screen app:

- **START RIDE** — creates a ride (unique `ride_id`, start timestamp, default
  condition `SAFE`), requests location permissions, and starts background GPS
  collection.
- **SAFE / UNSAFE** — toggles the ride's current condition. Every GPS point
  inherits the condition active when it is recorded, which yields
  segment-level information without per-point annotation.
- **STOP RIDE** — stops GPS collection, records the end timestamp, marks the
  ride complete, and queues it for upload.

Key implementation points:

- **GPS sampling** — one observation roughly every 5 seconds (configurable in
  `mobile/src/config.ts`), collected via `expo-location` +
  `expo-task-manager` so recording continues while the phone is locked or the
  app is backgrounded. On Android a visible foreground-service notification
  keeps recording alive; on iOS the background location indicator is shown.
  Location is only collected while a ride is active.
- **Local storage** — everything is written to SQLite (`expo-sqlite`) first.
  The app works with no network connection; rides stay on the device until
  the server confirms the upload.
- **Sync** — completed rides move through `LOCAL → PENDING → UPLOADING →
  SYNCED`. Upload is attempted when a ride ends, when the app opens or
  returns to the foreground, and periodically while the app is active. A
  failed upload puts the ride back in `PENDING`; nothing is deleted. Rides
  interrupted mid-upload (app killed) are re-queued on the next launch.
- **Identity** — no accounts. A random persistent `user_...` identifier is
  generated per installation so rides from the same installation can be
  associated.

#### Backend (`server/`)

A deliberately small Express app backed by PostgreSQL + PostGIS:

- `POST /rides` — validates and stores a completed ride with all of its GPS
  observations in one transaction. **Idempotent on `ride_id`**: re-sending an
  already-stored ride returns success without creating duplicates, so the
  mobile app can retry freely.
- `GET /rides/:id` — returns the ride and its ordered points (verification /
  debugging).
- `GET /health` — liveness + database connectivity.

The schema (`server/schema.sql`) preserves raw observations immutably and
adds a generated PostGIS `geometry(Point, 4326)` column plus a GiST index so
later geospatial analysis (map matching, segment scoring) is easy.

### Running the backend

```bash
cd server

# 1. Start PostgreSQL + PostGIS (applies schema.sql on first run)
docker compose up -d db

# 2. Install dependencies and start the API
npm install
npm start          # listens on :3000; override with PORT / DATABASE_URL
```

Defaults: `DATABASE_URL=postgres://gps4b:gps4b@localhost:5432/gps4b`.

Run the unit tests with `npm test`.

### Running the mobile app

```bash
cd mobile
npm install
```

Point the app at your server: edit `apiUrl` in `mobile/src/config.ts` to your
machine's LAN address (e.g. `http://192.168.1.42:3000` — the phone must be
able to reach it; plain HTTP is for local development only, use HTTPS for any
real deployment).

Background location requires a **development build** — it does not work in
Expo Go:

```bash
npx expo run:android    # Android device/emulator
npx expo run:ios        # iOS (requires macOS + Xcode)
```

(or build with EAS: `eas build --profile development`.)

When starting the first ride, grant location access **"Allow all the time"**
(Android) / **"Always"** (iOS) so recording continues while the phone is
locked.

**Just want to install the app, not build it?** Grab the latest build from
the [Releases page](https://github.com/ablack3/GPS4B/releases/latest) —
see [mobile/README.md](mobile/README.md) for step-by-step install
instructions for Android and iPhone, and how releases are built.

### Verifying the v0.1 acceptance flow

1. Start the backend and install the app on a phone.
2. Press **START RIDE**, pocket the phone, ride, toggle **SAFE/UNSAFE** a few
   times, lock the phone for part of the ride.
3. Press **STOP RIDE**. With no connectivity the ride shows as
   "waiting to upload" and survives app restarts; once connectivity returns
   (and the app is opened) it uploads automatically.
4. Query the central database:

```sql
SELECT "timestamp", latitude, longitude, condition
FROM location_points
WHERE ride_id = '<ride id>'
ORDER BY "timestamp";
```

You should see the complete ordered series of GPS observations with the
correct SAFE/UNSAFE state for each portion of the ride.

### Explicitly out of scope for v0.1

Navigation, route recommendations, map matching, machine learning, social
features, real-time streaming, push notifications, and authentication — these
are the pitch's future phases, not this milestone. None of them should delay
the data collection experiment.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
