/**
 * GPS4B v0.1 — web app.
 *
 * The browser counterpart of the native mobile app: record GPS points during
 * an explicitly started ride, tag the current portion GOOD or BAD, store
 * everything locally first (IndexedDB), then sync completed rides to a GPS4B
 * server — or export them as JSON/CSV.
 *
 * Browser limitation, stated honestly in the UI: geolocation stops when the
 * screen locks or the tab is backgrounded. A screen wake lock is requested
 * while recording to keep the phone awake.
 */
'use strict';

const CONFIG = {
  gpsIntervalMs: 5000, // target: one observation every 3–10 s
  syncIntervalMs: 60_000,
  dbName: 'gps4b',
  dbVersion: 1,
};

// The sampling frequency is configurable (spec §8): ?interval=<ms> overrides
// the default, e.g. gps4b.example.org/?interval=10000 for one point per 10 s.
{
  const interval = Number(new URLSearchParams(location.search).get('interval'));
  if (Number.isFinite(interval) && interval >= 0) CONFIG.gpsIntervalMs = interval;
}

// ---------------------------------------------------------------------------
// IndexedDB (promise wrappers, no dependencies)
// ---------------------------------------------------------------------------

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('rides')) {
        db.createObjectStore('rides', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('points')) {
        const points = db.createObjectStore('points', {
          keyPath: 'id',
          autoIncrement: true,
        });
        points.createIndex('ride_id', 'ride_id');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        const result = fn(t);
        t.oncomplete = () => resolve(result.__value);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function reqValue(request, holder) {
  request.onsuccess = () => {
    holder.__value = request.result;
  };
  return holder;
}

const store = {
  putRide: (ride) => tx(['rides'], 'readwrite', (t) => ({ __value: t.objectStore('rides').put(ride) && undefined })),
  getRide: (id) => tx(['rides'], 'readonly', (t) => reqValue(t.objectStore('rides').get(id), {})),
  getAllRides: () => tx(['rides'], 'readonly', (t) => reqValue(t.objectStore('rides').getAll(), {})),
  addPoint: (point) => tx(['points'], 'readwrite', (t) => ({ __value: t.objectStore('points').add(point) && undefined })),
  getPoints: (rideId) =>
    tx(['points'], 'readonly', (t) =>
      reqValue(t.objectStore('points').index('ride_id').getAll(rideId), {})
    ),
  countPoints: (rideId) =>
    tx(['points'], 'readonly', (t) =>
      reqValue(t.objectStore('points').index('ride_id').count(rideId), {})
    ),
  deleteRide: (rideId) =>
    tx(['rides', 'points'], 'readwrite', (t) => {
      t.objectStore('rides').delete(rideId);
      const idx = t.objectStore('points').index('ride_id');
      idx.getAllKeys(rideId).onsuccess = (e) => {
        for (const key of e.target.result) t.objectStore('points').delete(key);
      };
      return {};
    }),
};

// ---------------------------------------------------------------------------
// Identity & settings (localStorage)
// ---------------------------------------------------------------------------

function getUserId() {
  let id = localStorage.getItem('gps4b_user_id');
  if (!id) {
    id = `user_${crypto.randomUUID()}`;
    localStorage.setItem('gps4b_user_id', id);
  }
  return id;
}

function getServerUrl() {
  return (localStorage.getItem('gps4b_server_url') || '').replace(/\/+$/, '');
}

function setServerUrl(url) {
  localStorage.setItem('gps4b_server_url', url.trim());
}

// ---------------------------------------------------------------------------
// Ride recording
// ---------------------------------------------------------------------------

let activeRide = null; // {id, started_at, ended_at, current_condition, sync_status, created_at}
let watchId = null;
let lastSavedAt = 0;
let wakeLock = null;

async function startRide() {
  const now = new Date().toISOString();
  activeRide = {
    id: `ride_${crypto.randomUUID()}`,
    started_at: now,
    ended_at: null,
    current_condition: 'GOOD',
    sync_status: 'LOCAL',
    created_at: now,
  };
  await store.putRide(activeRide);
  await startWatching();
  await acquireWakeLock();
}

function startWatching() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    let settled = false;
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!settled) {
          settled = true;
          resolve();
        }
        onPosition(position);
      },
      (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(geoErrorMessage(err)));
        } else {
          showError(geoErrorMessage(err));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 }
    );
  });
}

function geoErrorMessage(err) {
  if (err.code === 1) {
    return 'Location permission denied. GPS4B records your location only while you are recording a ride so your route can contribute to the bicycle map. Please allow location access.';
  }
  if (err.code === 2) return 'Location unavailable — no GPS fix yet.';
  return 'Location request timed out.';
}

async function onPosition(position) {
  if (!activeRide) return;
  const now = position.timestamp || Date.now();
  // Throttle to the configured sampling interval; the browser may fire more
  // often than we want to record.
  if (now - lastSavedAt < CONFIG.gpsIntervalMs) return;
  lastSavedAt = now;

  const c = position.coords;
  await store.addPoint({
    ride_id: activeRide.id,
    timestamp: new Date(now).toISOString(),
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: c.accuracy ?? null,
    altitude: c.altitude ?? null,
    speed: c.speed ?? null,
    heading: c.heading ?? null,
    condition: activeRide.current_condition,
  });
  refreshPointCount();
}

async function setCondition(condition) {
  if (!activeRide) return;
  activeRide.current_condition = condition;
  await store.putRide(activeRide);
  renderCondition();
}

async function stopRide() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  stopKeepAwake();
  if (activeRide) {
    activeRide.ended_at = new Date().toISOString();
    activeRide.sync_status = 'PENDING';
    await store.putRide(activeRide);
    activeRide = null;
  }
  syncPendingRides(); // opportunistic; failures stay queued
}

// Resume a ride that was recording when the page was closed or reloaded.
async function resumeActiveRideIfAny() {
  const rides = (await store.getAllRides()) || [];
  const open = rides.find((r) => !r.ended_at);
  if (!open) return false;
  activeRide = open;
  try {
    await startWatching();
    await acquireWakeLock();
  } catch (e) {
    showError(e.message);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Keep the screen awake while recording — like a navigation app.
//
// Primary: the Screen Wake Lock API, re-acquired automatically whenever the
// system releases it (tab switch, low battery, OS whim). Fallback for
// browsers without the API: an invisible muted playing video (fed from a
// canvas stream), which also prevents the screen from sleeping.
// ---------------------------------------------------------------------------

let wakeLockRetryTimer = null;
let noSleepVideo = null;

/** User preference; defaults to keeping the screen on. */
function keepAwakeEnabled() {
  try {
    return localStorage.getItem('gps4b_keep_awake') !== '0';
  } catch {
    return true;
  }
}

function setKeepAwakeEnabled(on) {
  try {
    localStorage.setItem('gps4b_keep_awake', on ? '1' : '0');
  } catch {
    /* preference just won't persist */
  }
  if (activeRide) {
    if (on) acquireWakeLock();
    else stopKeepAwake();
  } else {
    renderWakeStatus();
  }
}

async function acquireWakeLock() {
  if (!activeRide || !keepAwakeEnabled()) return;
  if ('wakeLock' in navigator) {
    try {
      if (!wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
          // Re-acquire as soon as possible while a ride is active.
          if (activeRide && document.visibilityState === 'visible') {
            scheduleWakeLockRetry();
          }
          renderWakeStatus();
        });
      }
      renderWakeStatus();
      return;
    } catch {
      /* fall through to the video fallback */
    }
  }
  startNoSleepVideo();
  renderWakeStatus();
}

function scheduleWakeLockRetry() {
  if (wakeLockRetryTimer) return;
  wakeLockRetryTimer = setTimeout(() => {
    wakeLockRetryTimer = null;
    acquireWakeLock();
  }, 2000);
}

function startNoSleepVideo() {
  if (noSleepVideo) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 32, 32);
    };
    draw();
    const stream = canvas.captureStream(1);
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.style.cssText =
      'position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);
    const played = video.play();
    if (played) played.catch(() => {});
    video._drawTimer = setInterval(draw, 1000); // keep the stream producing frames
    noSleepVideo = video;
  } catch {
    /* no keep-awake available; renderWakeStatus shows the manual advice */
  }
}

function stopKeepAwake() {
  if (wakeLockRetryTimer) {
    clearTimeout(wakeLockRetryTimer);
    wakeLockRetryTimer = null;
  }
  try {
    wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
  if (noSleepVideo) {
    clearInterval(noSleepVideo._drawTimer);
    try {
      noSleepVideo.srcObject.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    noSleepVideo.remove();
    noSleepVideo = null;
  }
  renderWakeStatus();
}

function renderWakeStatus() {
  const el = $('wake-status');
  if (!el) return;
  if (!activeRide) {
    el.textContent = '';
    return;
  }
  if (!keepAwakeEnabled()) {
    el.textContent = '⚠️ Screen may sleep — GPS stops while the screen is off';
    el.classList.add('wake-warning');
  } else if (wakeLock || noSleepVideo) {
    el.textContent = '🔆 Screen staying awake while recording';
    el.classList.remove('wake-warning');
  } else {
    el.textContent =
      '⚠️ Could not keep the screen awake — set auto-lock to Never for this ride';
    el.classList.add('wake-warning');
  }
}

document.addEventListener('visibilitychange', () => {
  // Wake locks are released when the tab is hidden; reacquire on return.
  if (document.visibilityState === 'visible' && activeRide) acquireWakeLock();
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

let syncInFlight = false;

function ridePayload(ride, points) {
  return {
    ride_id: ride.id,
    user_id: getUserId(),
    started_at: ride.started_at,
    ended_at: ride.ended_at,
    points: points
      .slice()
      .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
      .map((p) => ({
        timestamp: p.timestamp,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy,
        altitude: p.altitude,
        speed: p.speed,
        heading: p.heading,
        condition: p.condition,
      })),
  };
}

async function syncPendingRides() {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const serverUrl = getServerUrl();
    if (!serverUrl || !navigator.onLine) return;

    const rides = ((await store.getAllRides()) || []).filter(
      (r) => r.ended_at && (r.sync_status === 'PENDING' || r.sync_status === 'UPLOADING')
    );

    for (const ride of rides) {
      ride.sync_status = 'UPLOADING';
      await store.putRide(ride);
      try {
        const points = (await store.getPoints(ride.id)) || [];
        const response = await fetch(`${serverUrl}/rides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ridePayload(ride, points)),
        });
        ride.sync_status = response.ok ? 'SYNCED' : 'PENDING';
      } catch {
        ride.sync_status = 'PENDING'; // network error — retry later, keep data
      }
      await store.putRide(ride);
    }
  } catch {
    /* opportunistic — always retried later */
  } finally {
    syncInFlight = false;
    renderRidesList();
    refreshStatusLine();
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function exportRide(rideId, format) {
  const ride = await store.getRide(rideId);
  const points = (await store.getPoints(rideId)) || [];
  const payload = ridePayload(ride, points);

  let blob, filename;
  if (format === 'csv') {
    const header = 'timestamp,latitude,longitude,accuracy,altitude,speed,heading,condition';
    const rows = payload.points.map((p) =>
      [p.timestamp, p.latitude, p.longitude, p.accuracy ?? '', p.altitude ?? '', p.speed ?? '', p.heading ?? '', p.condition].join(',')
    );
    blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    filename = `${rideId}.csv`;
  } else {
    blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    filename = `${rideId}.json`;
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// Ride map (verification view — see map.js)
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

let mapRideId = null;
let mapLiveTimer = null;

async function showRideMap(rideId, title) {
  mapRideId = rideId;
  const panel = $('map-panel');
  panel.hidden = false;
  $('map-title').textContent = title;
  await refreshMap();
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // While the mapped ride is still recording, refresh as new points arrive.
  clearInterval(mapLiveTimer);
  mapLiveTimer = setInterval(() => {
    if (!panel.hidden && activeRide && activeRide.id === mapRideId) refreshMap();
    else clearInterval(mapLiveTimer);
  }, 5000);
}

async function refreshMap() {
  if (!mapRideId) return;
  const points = (await store.getPoints(mapRideId)) || [];
  points.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  const stats = GPS4BMap.computeStats(points);
  $('map-stats').textContent = GPS4BMap.formatStats(stats);
  const { tiles } = await GPS4BMap.render($('map-canvas'), points);
  $('map-attribution').hidden = !tiles;
  $('map-note').textContent =
    !tiles && points.length > 0
      ? 'Map tiles unavailable (offline?) — showing the track shape only.'
      : '';
}

function closeMap() {
  $('map-panel').hidden = true;
  mapRideId = null;
  clearInterval(mapLiveTimer);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function showError(message) {
  $('error-line').textContent = message || '';
}

function renderCondition() {
  const condition = activeRide?.current_condition ?? 'GOOD';
  $('btn-good').classList.toggle('active', condition === 'GOOD');
  $('btn-bad').classList.toggle('active', condition === 'BAD');
}

function renderRecordingState() {
  document.body.classList.toggle('recording', !!activeRide);
  renderCondition();
  refreshPointCount();
  refreshStatusLine();
  renderWakeStatus();
}

async function refreshPointCount() {
  if (!activeRide) return;
  const n = (await store.countPoints(activeRide.id)) || 0;
  $('point-count').textContent = `${n} GPS point${n === 1 ? '' : 's'} recorded`;
}

async function refreshStatusLine() {
  const rides = (await store.getAllRides()) || [];
  const pending = rides.filter((r) => r.ended_at && r.sync_status !== 'SYNCED').length;
  if (activeRide) {
    $('status-line').textContent = '';
  } else if (pending > 0) {
    $('status-line').textContent = getServerUrl()
      ? `${pending} ride${pending === 1 ? '' : 's'} waiting to upload`
      : `${pending} ride${pending === 1 ? '' : 's'} stored locally (no server configured)`;
  } else if (rides.length > 0) {
    $('status-line').textContent = 'All rides uploaded';
  } else {
    $('status-line').textContent = '';
  }
}

async function renderRidesList() {
  const rides = ((await store.getAllRides()) || [])
    .filter((r) => r.ended_at)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));

  const list = $('rides-list');
  list.innerHTML = '';
  if (rides.length === 0) {
    list.innerHTML = '<div class="ride-item meta">No completed rides yet.</div>';
    return;
  }
  for (const ride of rides) {
    const n = (await store.countPoints(ride.id)) || 0;
    const item = document.createElement('div');
    item.className = 'ride-item';
    const started = new Date(ride.started_at).toLocaleString();
    item.innerHTML = `
      <div><span class="badge ${ride.sync_status}">${ride.sync_status}</span>
        <strong>${started}</strong></div>
      <div class="meta">${n} points · ${ride.id}</div>
      <div class="ride-actions">
        <button data-action="map">Map</button>
        <button data-action="json">Export JSON</button>
        <button data-action="csv">Export CSV</button>
        <button data-action="delete">Delete</button>
      </div>`;
    item.querySelector('[data-action=map]').onclick = () =>
      showRideMap(ride.id, `Ride · ${started}`);
    item.querySelector('[data-action=json]').onclick = () => exportRide(ride.id, 'json');
    item.querySelector('[data-action=csv]').onclick = () => exportRide(ride.id, 'csv');
    item.querySelector('[data-action=delete]').onclick = async () => {
      if (confirm('Delete this ride from this device?')) {
        await store.deleteRide(ride.id);
        renderRidesList();
        refreshStatusLine();
      }
    };
    list.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function main() {
  $('user-id-label').textContent = getUserId().slice(0, 13) + '…';
  $('server-url').value = getServerUrl();

  $('btn-start').onclick = async () => {
    showError('');
    $('btn-start').disabled = true;
    try {
      await startRide();
      renderRecordingState();
    } catch (e) {
      // Permission denied or no fix: do not leave a half-started ride behind.
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (activeRide) {
        await store.deleteRide(activeRide.id);
        activeRide = null;
      }
      showError(e.message);
    } finally {
      $('btn-start').disabled = false;
    }
  };

  $('btn-stop').onclick = async () => {
    $('btn-stop').disabled = true;
    try {
      await stopRide();
      renderRecordingState();
      renderRidesList();
    } finally {
      $('btn-stop').disabled = false;
    }
  };

  $('btn-good').onclick = () => setCondition('GOOD');
  $('btn-bad').onclick = () => setCondition('BAD');

  $('keep-awake-toggle').checked = keepAwakeEnabled();
  $('keep-awake-toggle').onchange = (e) => setKeepAwakeEnabled(e.target.checked);

  $('btn-show-map').onclick = () => {
    if (activeRide) showRideMap(activeRide.id, 'Live track');
  };
  $('map-close').onclick = closeMap;

  $('btn-save-server').onclick = () => {
    setServerUrl($('server-url').value);
    refreshStatusLine();
    syncPendingRides();
  };
  $('btn-sync-now').onclick = () => syncPendingRides();

  // Recovery: resume a ride that was recording when the page closed, and
  // requeue anything stuck in UPLOADING.
  const rides = (await store.getAllRides()) || [];
  for (const r of rides) {
    if (r.ended_at && r.sync_status === 'UPLOADING') {
      r.sync_status = 'PENDING';
      await store.putRide(r);
    }
  }
  await resumeActiveRideIfAny();
  renderRecordingState();
  renderRidesList();

  // Sync triggers: on load, when connectivity returns, periodically.
  syncPendingRides();
  window.addEventListener('online', syncPendingRides);
  setInterval(syncPendingRides, CONFIG.syncIntervalMs);
  setInterval(() => activeRide && refreshPointCount(), 3000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

main();

// Exposed for automated tests.
window.GPS4B = {
  store,
  getUserId,
  getServerUrl,
  setServerUrl,
  syncPendingRides,
  getActiveRide: () => activeRide,
  config: CONFIG,
};
