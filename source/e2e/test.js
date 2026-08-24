/**
 * GPS4B web app E2E test.
 *
 * Usage: node test.js <appUrl> [apiUrl]
 *
 * Drives the full v0.1 acceptance flow in a real Chromium with mocked GPS:
 * start ride -> points accumulate -> toggle GOOD/BAD -> stop ride ->
 * data persists across reload -> offline sync fails safely -> online sync
 * succeeds -> ride verified in the central database via the API.
 * If apiUrl is omitted, the sync/database steps are skipped.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const appUrl = process.argv[2];
const apiUrl = process.argv[3] || null;
if (!appUrl) {
  console.error('usage: node test.js <appUrl> [apiUrl]');
  process.exit(2);
}

// A short ride through Boston.
const route = [
  { latitude: 42.3601, longitude: -71.0589 },
  { latitude: 42.3602, longitude: -71.0591 },
  { latitude: 42.3603, longitude: -71.0593 },
  { latitude: 42.3604, longitude: -71.0595 }, // condition -> BAD before this
  { latitude: 42.3605, longitude: -71.0597 },
  { latitude: 42.3606, longitude: -71.0599 }, // condition -> GOOD before this
  { latitude: 42.3607, longitude: -71.0601 },
];

async function waitForSyncStatus(page, rideId, want, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await page.evaluate(
      (id) => window.GPS4B.store.getRide(id).then((r) => r.sync_status),
      rideId
    );
    if (status === want) return;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for sync_status ${want} (last: ${status})`);
    }
    await page.waitForTimeout(200);
  }
}

async function main() {
  // CHROMIUM_PATH points at a system Chromium when Playwright's own browser
  // download isn't available; otherwise Playwright resolves its own.
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { ...route[0], accuracy: 5 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

  const url = appUrl + (appUrl.includes('?') ? '&' : '?') + 'interval=100';
  console.log('1. Loading', url);
  await page.goto(url, { waitUntil: 'load' });
  assert.equal(await page.title(), 'GPS4B');

  console.log('2. START RIDE');
  await page.click('#btn-start');
  await page.waitForSelector('body.recording', { timeout: 10000 });

  const rideId = await page.evaluate(() => window.GPS4B.getActiveRide().id);
  assert.ok(rideId.startsWith('ride_'), 'ride id created');
  await page.waitForFunction(
    () => document.getElementById('wake-status')?.textContent.length > 0,
    { timeout: 5000 }
  );
  const wakeStatus = await page.textContent('#wake-status');
  assert.ok(/staying awake/i.test(wakeStatus), `screen keep-awake reported: ${wakeStatus}`);

  // Keep-screen-on toggle: defaults on, can be switched off and back mid-ride.
  assert.equal(await page.isChecked('#keep-awake-toggle'), true, 'keep-awake defaults on');
  await page.uncheck('#keep-awake-toggle');
  await page.waitForFunction(() =>
    /may sleep/i.test(document.getElementById('wake-status').textContent)
  );
  await page.check('#keep-awake-toggle');
  await page.waitForFunction(() =>
    /staying awake/i.test(document.getElementById('wake-status').textContent)
  );
  const userId = await page.evaluate(() => window.GPS4B.getUserId());
  assert.ok(userId.startsWith('user_'), 'anonymous user id created');

  console.log('3. Riding (GOOD), feeding GPS positions...');
  const feed = async (from, to) => {
    for (let i = from; i < to; i++) {
      await context.setGeolocation({ ...route[i], accuracy: 5 });
      await page.waitForTimeout(250);
    }
  };
  await feed(0, 3);

  console.log('4. Toggle condition to BAD');
  await page.click('#btn-bad');
  await feed(3, 5);

  console.log('5. Toggle condition back to GOOD');
  await page.click('#btn-good');
  await feed(5, 7);

  const livePoints = await page.evaluate(
    (id) => window.GPS4B.store.countPoints(id),
    rideId
  );
  console.log(`   ${livePoints} points recorded while riding`);
  assert.ok(livePoints >= 5, `expected >=5 points, got ${livePoints}`);

  console.log('6. STOP RIDE');
  await page.click('#btn-stop');
  await page.waitForFunction(() => !document.body.classList.contains('recording'));

  const points = await page.evaluate((id) => window.GPS4B.store.getPoints(id), rideId);
  const conditions = [...new Set(points.map((p) => p.condition))].sort();
  assert.deepEqual(conditions, ['BAD', 'GOOD'], 'both conditions recorded');
  const ordered = points.map((p) => p.timestamp);
  assert.deepEqual(ordered, [...ordered].sort(), 'points in time order');
  for (const p of points) {
    assert.ok(p.latitude >= 42.36 && p.latitude <= 42.361, 'latitude plausible');
    assert.ok(typeof p.accuracy === 'number', 'accuracy captured');
  }
  // The BAD segment must be contiguous and in the middle of the ride.
  const seq = points.map((p) => p.condition).join(',');
  assert.match(seq, /^GOOD(,GOOD)*(,BAD)+(,GOOD)+$/, `segments look right: ${seq}`);

  console.log('6b. Map view shows the recorded track');
  await page.click('#rides-panel summary');
  await page.click('.ride-item [data-action=map]');
  await page.waitForFunction(() => !document.getElementById('map-panel').hidden);
  await page.waitForFunction(
    (n) => document.getElementById('map-stats').textContent.includes(`${n} points`),
    livePoints,
    { timeout: 10000 }
  );
  const mapStats = await page.textContent('#map-stats');
  assert.ok(/GOOD \d+ \/ BAD \d+/.test(mapStats), `map stats show condition split: ${mapStats}`);
  const canvasPainted = await page.evaluate(() => {
    const c = document.getElementById('map-canvas');
    return c.width > 0 && c.height > 0;
  });
  assert.ok(canvasPainted, 'map canvas rendered');
  await page.click('#map-close');
  await page.click('#rides-panel summary'); // collapse again for later steps

  console.log('7. Reload page — ride must persist locally');
  await page.reload({ waitUntil: 'load' });
  const persisted = await page.evaluate((id) => window.GPS4B.store.getRide(id), rideId);
  assert.ok(persisted, 'ride survived reload');
  assert.equal(persisted.ended_at === null, false, 'ride is completed');
  await page.waitForSelector('#rides-panel');

  if (!apiUrl) {
    console.log('   (no apiUrl given — skipping sync/database verification)');
    await browser.close();
    console.log('\nALL LOCAL-ONLY CHECKS PASSED');
    return;
  }

  console.log('8. Configure server URL while OFFLINE — sync must fail safely');
  await page.click('#rides-panel summary'); // expand the collapsed panel
  await page.fill('#server-url', apiUrl);
  await page.click('#btn-save-server');
  await context.setOffline(true);
  await page.click('#btn-sync-now');
  await page.waitForTimeout(800);
  let status = await page.evaluate(
    (id) => window.GPS4B.store.getRide(id).then((r) => r.sync_status),
    rideId
  );
  assert.notEqual(status, 'SYNCED', 'must not claim SYNCED while offline');
  const stillThere = await page.evaluate((id) => window.GPS4B.store.getPoints(id), rideId);
  assert.equal(stillThere.length, points.length, 'no data lost by failed sync');

  console.log('9. Back ONLINE — sync now');
  await context.setOffline(false);
  await page.click('#btn-sync-now');
  await waitForSyncStatus(page, rideId, 'SYNCED');
  console.log('   ride reports SYNCED');

  console.log('10. Verify ride in the central database via the API');
  const res = await fetch(`${apiUrl}/rides/${rideId}`);
  assert.equal(res.status, 200, 'ride retrievable from server');
  const stored = await res.json();
  assert.equal(stored.points.length, points.length, 'all points stored');
  assert.deepEqual(
    stored.points.map((p) => p.condition),
    points.map((p) => p.condition),
    'conditions preserved in order'
  );
  assert.equal(stored.user_id, userId, 'user id associated');

  console.log('11. Re-sync is idempotent (no duplicates)');
  await page.evaluate((id) =>
    window.GPS4B.store.getRide(id).then((r) => {
      r.sync_status = 'PENDING';
      return window.GPS4B.store.putRide(r);
    }),
    rideId
  );
  await page.click('#btn-sync-now');
  await waitForSyncStatus(page, rideId, 'SYNCED');
  const res2 = await fetch(`${apiUrl}/rides/${rideId}`);
  const stored2 = await res2.json();
  assert.equal(stored2.points.length, points.length, 'still no duplicate points');

  await browser.close();
  console.log('\nALL CHECKS PASSED (full pipeline: browser GPS -> IndexedDB -> sync -> PostgreSQL)');
}

main().catch((e) => {
  console.error('\nTEST FAILED:', e.message);
  process.exit(1);
});
