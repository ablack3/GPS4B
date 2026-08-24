# GPS4B end-to-end test

Drives the web app in a real Chromium with mocked GPS through the full v0.1
acceptance flow: start ride → points accumulate → GOOD/BAD segments → stop →
data survives reload → offline sync fails safely → online sync succeeds →
ride verified in the central database → re-sync is idempotent.

```bash
npm install
npx playwright install chromium   # once, if no browser is present

# Against a locally served web app + local API:
node test.js http://localhost:8080/ http://localhost:3000

# Against deployed instances (e.g. GitHub Pages + Render):
node test.js https://ablack3033.github.io/GPS4B/ https://gps4b-api.onrender.com

# Web app only (skips the sync/database steps):
node test.js http://localhost:8080/
```
