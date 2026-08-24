/**
 * GPS4B ride map — a verification view, not navigation.
 *
 * Draws a ride's recorded GPS points over OpenStreetMap raster tiles
 * (Web Mercator math done by hand — no map library), with the track colored
 * by the rider-reported condition: green for GOOD, red for BAD. When tiles
 * can't load (offline, or a host that blocks external requests) the track is
 * drawn over a plain grid instead, which is still enough to judge the shape
 * and continuity of the recording.
 */
'use strict';

const GPS4BMap = (() => {
  const TILE_SIZE = 256;
  const MAX_ZOOM = 17;
  const TILE_TIMEOUT_MS = 5000;
  const COLORS = { GOOD: '#2e7d32', BAD: '#c62828' };

  const tileUrl = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

  function lonToWorldX(lon, z) {
    return ((lon + 180) / 360) * TILE_SIZE * 2 ** z;
  }
  function latToWorldY(lat, z) {
    const rad = (lat * Math.PI) / 180;
    return (
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      TILE_SIZE *
      2 ** z
    );
  }

  function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  /** Distance, duration, condition split, and accuracy summary for a ride. */
  function computeStats(points) {
    let meters = 0;
    for (let i = 1; i < points.length; i++) meters += haversineMeters(points[i - 1], points[i]);
    const bad = points.filter((p) => p.condition === 'BAD').length;
    const accuracies = points
      .map((p) => p.accuracy)
      .filter((a) => typeof a === 'number')
      .sort((x, y) => x - y);
    const medianAccuracy = accuracies.length
      ? accuracies[Math.floor(accuracies.length / 2)]
      : null;
    let seconds = null;
    if (points.length >= 2) {
      seconds =
        (new Date(points[points.length - 1].timestamp) - new Date(points[0].timestamp)) / 1000;
    }
    return { count: points.length, meters, seconds, good: points.length - bad, bad, medianAccuracy };
  }

  function formatStats(s) {
    const parts = [`${s.count} point${s.count === 1 ? '' : 's'}`];
    if (s.meters >= 10) {
      parts.push(s.meters >= 1000 ? `${(s.meters / 1000).toFixed(2)} km` : `${Math.round(s.meters)} m`);
    }
    if (s.seconds != null && s.seconds > 0) {
      const m = Math.floor(s.seconds / 60);
      parts.push(m >= 1 ? `${m} min` : `${Math.round(s.seconds)} s`);
    }
    if (s.count > 0) parts.push(`GOOD ${s.good} / BAD ${s.bad}`);
    if (s.medianAccuracy != null) parts.push(`±${Math.round(s.medianAccuracy)} m accuracy`);
    return parts.join(' · ');
  }

  function loadTile(z, x, y) {
    return new Promise((resolve) => {
      const max = 2 ** z;
      if (y < 0 || y >= max) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), TILE_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = tileUrl(z, ((x % max) + max) % max, y);
    });
  }

  function drawGrid(ctx, w, h) {
    ctx.fillStyle = '#eef1ee';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d7dcd7';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, 0);
      ctx.lineTo(gx + 0.5, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy + 0.5);
      ctx.lineTo(w, gy + 0.5);
      ctx.stroke();
    }
  }

  /**
   * Render a ride onto `canvas`. Returns {tiles: boolean} — whether OSM
   * tiles were drawn (attribution must be shown when they were).
   */
  async function render(canvas, points) {
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth || 320;
    const ch = canvas.clientHeight || 320;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    if (points.length === 0) {
      drawGrid(ctx, cw, ch);
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No GPS points recorded yet', cw / 2, ch / 2);
      return { tiles: false };
    }

    const lats = points.map((p) => p.latitude);
    const lons = points.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);

    // Largest zoom at which the whole track fits with padding.
    const PAD = 40;
    let zoom = 16;
    for (let z = MAX_ZOOM; z >= 2; z--) {
      const spanX = Math.abs(lonToWorldX(maxLon, z) - lonToWorldX(minLon, z));
      const spanY = Math.abs(latToWorldY(minLat, z) - latToWorldY(maxLat, z));
      if (spanX <= cw - PAD && spanY <= ch - PAD) {
        zoom = z;
        break;
      }
    }

    const centerX = (lonToWorldX(minLon, zoom) + lonToWorldX(maxLon, zoom)) / 2;
    const centerY = (latToWorldY(minLat, zoom) + latToWorldY(maxLat, zoom)) / 2;
    const originX = centerX - cw / 2;
    const originY = centerY - ch / 2;
    const toCanvas = (p) => [
      lonToWorldX(p.longitude, zoom) - originX,
      latToWorldY(p.latitude, zoom) - originY,
    ];

    // Background: OSM tiles, or the grid fallback if none load.
    const x0 = Math.floor(originX / TILE_SIZE);
    const y0 = Math.floor(originY / TILE_SIZE);
    const x1 = Math.floor((originX + cw) / TILE_SIZE);
    const y1 = Math.floor((originY + ch) / TILE_SIZE);
    const jobs = [];
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        jobs.push(loadTile(zoom, tx, ty).then((img) => ({ img, tx, ty })));
      }
    }
    const tiles = await Promise.all(jobs);
    const loaded = tiles.filter((t) => t.img);
    if (loaded.length === 0) {
      drawGrid(ctx, cw, ch);
    } else {
      ctx.fillStyle = '#eef1ee';
      ctx.fillRect(0, 0, cw, ch);
      for (const t of loaded) {
        ctx.drawImage(t.img, t.tx * TILE_SIZE - originX, t.ty * TILE_SIZE - originY, TILE_SIZE, TILE_SIZE);
      }
    }

    // Track: segments colored by the condition of the arriving point.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = toCanvas(points[i - 1]);
      const [bx, by] = toCanvas(points[i]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = COLORS[points[i].condition] || '#555';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Individual observations, when there aren't too many to read.
    if (points.length <= 500) {
      for (const p of points) {
        const [px, py] = toCanvas(p);
        ctx.fillStyle = COLORS[p.condition] || '#555';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Start and end markers.
    const marker = (p, label, fill) => {
      const [px, py] = toCanvas(p);
      ctx.fillStyle = fill;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px, py + 0.5);
    };
    marker(points[0], 'S', '#1565c0');
    if (points.length > 1) marker(points[points.length - 1], 'E', '#37474f');

    return { tiles: loaded.length > 0 };
  }

  return { render, computeStats, formatStats };
})();

window.GPS4BMap = GPS4BMap;
