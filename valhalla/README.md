# GPS4B routing backend (Valhalla)

GPS4B's own Valhalla instance, serving bicycle routing over a Massachusetts
OSM extract. Replaces `valhalla1.openstreetmap.de`, which forbids production
load. See [ADR 0001](../docs/adr/0001-self-hosted-valhalla.md) for why this is
self-hosted rather than a hosted API.

Clients are pointed here by setting one environment variable on the GPS4B API
service — no app release. Nothing in the client changes: the request the app
already sends is the request this instance already answers.

## Layout

| File | What it is |
| --- | --- |
| `docker-compose.yml` | What runs on the VM: Valhalla behind Caddy (TLS) |
| `Caddyfile` | TLS terminator; exposes only `POST /route` and `GET /status` |
| `provision.sh` | First-time VM setup — run **on** the VM |
| `build-tiles.sh` | Full tile rebuild from a Geofabrik extract — run **off** the VM |
| `deploy-tiles.sh` | Ship a tile tarball to the VM, swap it in, roll back on failure |
| `smoke-test.sh` | Route Boston Common → Harvard Square and check the answer |

Tiles, extracts, and `.env` are gitignored — they are hundreds of megabytes and
are rebuilt, not versioned.

## Why tiles are built off-box

Valhalla tile building peaks well above the 2GB the serving VM has. Building on
the host would OOM-kill it, and would take routing down for the duration.
`build-tiles.sh` runs on a GitHub Actions runner (or any machine with Docker
and headroom) and produces one `valhalla_tiles.tar`; the VM only ever unpacks
and serves it.

Valhalla has no incremental update, so every refresh is a full rebuild. The
cadence is monthly, via the `Valhalla tiles` workflow.

## Standing it up

Steps 1–3 need a human — an account, a payment method, and DNS control.

1. **Create the VM.** A Hetzner CPX11 in Ashburn (2 vCPU / 2GB / ~$5 per month)
   is the sizing ADR 0001 assumes. Debian or Ubuntu. Add your SSH key.
2. **Point DNS at it.** An `A` record for `routing.gps4b.org` at the VM's IPv4
   address. Caddy cannot issue a certificate until this resolves.
3. **Create a deploy key.** `ssh-keygen -t ed25519 -f valhalla-deploy -N ''`;
   put the `.pub` in the VM user's `~/.ssh/authorized_keys`, and the private
   key in the repo secret `VALHALLA_SSH_KEY`.
4. **Provision:**

   ```
   scp -r valhalla/ user@<vm>:~/
   ssh user@<vm> 'cd valhalla && ./provision.sh'   # installs Docker, then re-run
   ssh user@<vm> 'cd /opt/gps4b-valhalla && $EDITOR .env'   # DOMAIN, ACME_EMAIL
   ssh user@<vm> 'cd valhalla && ./provision.sh'   # brings the stack up
   ```

5. **Build and ship the first tiles.** Either run the `Valhalla tiles` workflow
   from the Actions tab, or locally:

   ```
   cd valhalla && ./build-tiles.sh
   VALHALLA_HOST=user@<vm> VALHALLA_URL=https://routing.gps4b.org ./deploy-tiles.sh
   ```

6. **Verify:** `./smoke-test.sh https://routing.gps4b.org`

7. **Cut clients over.** Set `ROUTING_URL=https://routing.gps4b.org/route` on
   the GPS4B API service (Render dashboard → `gps4b-api` → Environment).
   Clients pick it up from `GET /config` at next launch. Reverting is the same
   variable set back to the public server.

## Repo secrets the deploy job needs

| Secret | Example |
| --- | --- |
| `VALHALLA_HOST` | `deploy@routing.gps4b.org` |
| `VALHALLA_URL` | `https://routing.gps4b.org` |
| `VALHALLA_SSH_KEY` | contents of the private deploy key |

Without them the workflow still builds and verifies tiles and uploads them as a
run artifact; only the deploy step is skipped.

## Safety weighting later

The Segment Score milestone weights routes by rider-contributed data. On this
side that is a request parameter — `linear_cost_factors` — against the same
instance, not a new backend. The client seam is `buildRouteRequest` in
[`mobile/src/routing.ts`](../mobile/src/routing.ts) and `web/nav.js`.

## Known gaps

- **No rate limiting.** `POST /route` is open to the internet. Caddy caps
  request bodies at 64KB, which bounds the cost of any single request, but
  nothing bounds request volume. Worth adding before the instance is public
  knowledge.
- **Restart-length outage on tile swap.** `deploy-tiles.sh` restarts the
  container in place rather than running two instances behind the proxy.
  Acceptable monthly at this scale.
- **Massachusetts only.** Routes that leave the extract will not be found.
