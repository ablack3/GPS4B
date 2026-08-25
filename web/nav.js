/**
 * GPS4B v0.2 — map navigation overlay for the web app.
 *
 * Additive to app.js: a full-screen map (MapLibre GL JS + OpenFreeMap),
 * destination search, bike routing, and the same hazard/condition/ride
 * controls as the card UI below it — calling the same global functions
 * (startRide/stopRide/setCondition/reportHazard) from app.js so the two
 * views of one ride never disagree. Kept as a separate overlay, rather than
 * replacing the existing recording UI, so the v0.1 DOM (and its e2e test)
 * stays intact.
 */
'use strict';

const GPS4BNav = (() => {
  const SEARCH_DEBOUNCE_MS = 400;
  let map = null;
  let searchTimer = null;
  let userLocation = { latitude: 42.3601, longitude: -71.0589 }; // Boston fallback
  let destination = null;
  let routeGeoJson = null;

  async function searchDestination(query) {
    if (query.trim().length < 3) return [];
    const url = new URL(CONFIG.geocodeUrl);
    url.searchParams.set('text', query);
    url.searchParams.set('focus.point.lat', String(userLocation.latitude));
    url.searchParams.set('focus.point.lon', String(userLocation.longitude));
    url.searchParams.set('size', '5');
    if (CONFIG.geocodeApiKey) url.searchParams.set('api_key', CONFIG.geocodeApiKey);
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Search failed: ${response.status}`);
    const body = await response.json();
    return (body.features || []).map((f) => ({
      label: (f.properties && f.properties.label) || 'Unknown place',
      longitude: f.geometry.coordinates[0],
      latitude: f.geometry.coordinates[1],
    }));
  }

  function decodePolyline6(encoded) {
    const points = [];
    let index = 0, lat = 0, lon = 0;
    while (index < encoded.length) {
      lat += decodeSigned();
      lon += decodeSigned();
      points.push([lon / 1e6, lat / 1e6]);
    }
    return points;

    function decodeSigned() {
      let result = 0, shift = 0, byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return result & 1 ? ~(result >> 1) : result >> 1;
    }
  }

  async function getBikeRoute(from, to) {
    const response = await fetch(CONFIG.routingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': CONFIG.routingClientId },
      body: JSON.stringify({
        locations: [
          { lat: from.latitude, lon: from.longitude },
          { lat: to.latitude, lon: to.longitude },
        ],
        costing: 'bicycle',
        units: 'kilometers',
      }),
    });
    if (!response.ok) throw new Error(`Routing failed: ${response.status}`);
    const body = await response.json();
    const leg = body.trip.legs[0];
    return {
      coordinates: decodePolyline6(leg.shape),
      distanceMeters: body.trip.summary.length * 1000,
      durationSeconds: body.trip.summary.time,
    };
  }

  function ensureMap() {
    if (map) return map;
    map = new maplibregl.Map({
      container: 'nav-map',
      style: CONFIG.mapStyleUrl,
      center: [userLocation.longitude, userLocation.latitude],
      zoom: 14,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    return map;
  }

  function drawRoute(coordinates) {
    routeGeoJson = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
    const source = map.getSource('route');
    if (source) {
      source.setData(routeGeoJson);
    } else {
      map.addSource('route', { type: 'geojson', data: routeGeoJson });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1a73e8', 'line-width': 5 },
      });
    }
    const bounds = coordinates.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    );
    map.fitBounds(bounds, { padding: 60 });
  }

  function clearRoute() {
    routeGeoJson = null;
    if (map && map.getLayer('route-line')) map.removeLayer('route-line');
    if (map && map.getSource('route')) map.removeSource('route');
  }

  async function open() {
    document.getElementById('nav-overlay').hidden = false;
    ensureMap();
    map.resize();
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        userLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        map.setCenter([userLocation.longitude, userLocation.latitude]);
        new maplibregl.Marker({ color: '#1a73e8' }).setLngLat([userLocation.longitude, userLocation.latitude]).addTo(map);
      });
    }
    syncControlsFromRide();
  }

  function close() {
    document.getElementById('nav-overlay').hidden = true;
  }

  function syncControlsFromRide() {
    const active = window.GPS4B.getActiveRide();
    document.getElementById('nav-recording-row').hidden = !active;
    document.getElementById('nav-condition-row').hidden = !active;
    document.getElementById('nav-hazard-row').hidden = !active;
    document.getElementById('nav-btn-start').hidden = !!active || !!destination;
    document.getElementById('nav-btn-start-nav').hidden = !!active || !destination;
    document.getElementById('nav-btn-stop').hidden = !active;
    if (active) {
      document.getElementById('nav-btn-safe').classList.toggle('active', active.current_condition === 'SAFE');
      document.getElementById('nav-btn-unsafe').classList.toggle('active', active.current_condition === 'UNSAFE');
    }
  }

  function wireResultsList(results, onSelect) {
    const list = document.getElementById('nav-results');
    list.innerHTML = '';
    list.hidden = results.length === 0;
    for (const r of results) {
      const item = document.createElement('div');
      item.className = 'nav-result-row';
      item.textContent = r.label;
      item.onclick = () => onSelect(r);
      list.appendChild(item);
    }
  }

  function init() {
    document.getElementById('btn-open-nav').onclick = open;
    document.getElementById('nav-close').onclick = close;

    const input = document.getElementById('nav-search');
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const query = input.value;
      searchTimer = setTimeout(async () => {
        try {
          wireResultsList(await searchDestination(query), onSelectDestination);
        } catch {
          wireResultsList([], onSelectDestination);
        }
      }, SEARCH_DEBOUNCE_MS);
    });

    document.getElementById('nav-clear-destination').onclick = () => {
      destination = null;
      input.value = '';
      clearRoute();
      document.getElementById('nav-route-summary').hidden = true;
      document.getElementById('nav-clear-destination').hidden = true;
      syncControlsFromRide();
    };

    const onStart = async () => {
      try {
        await window.GPS4B.startRide();
      } catch (e) {
        alert(e.message || 'Could not start recording.');
      }
      syncControlsFromRide();
    };
    document.getElementById('nav-btn-start-nav').onclick = onStart;
    document.getElementById('nav-btn-start').onclick = onStart;
    document.getElementById('nav-btn-stop').onclick = async () => {
      const active = window.GPS4B.getActiveRide();
      if (active) await window.GPS4B.stopRide();
      clearRoute();
      document.getElementById('nav-route-summary').hidden = true;
      syncControlsFromRide();
    };
    document.getElementById('nav-btn-safe').onclick = () => {
      window.GPS4B.setCondition('SAFE');
      syncControlsFromRide();
    };
    document.getElementById('nav-btn-unsafe').onclick = () => {
      window.GPS4B.setCondition('UNSAFE');
      syncControlsFromRide();
    };
    for (const btn of document.querySelectorAll('[data-hazard-type]')) {
      btn.onclick = async () => {
        await window.GPS4B.reportHazard(btn.dataset.hazardType, userLocation.latitude, userLocation.longitude);
        btn.classList.add('flash');
        setTimeout(() => btn.classList.remove('flash'), 800);
      };
    }
  }

  async function onSelectDestination(result) {
    destination = result;
    document.getElementById('nav-search').value = result.label;
    wireResultsList([], onSelectDestination);
    document.getElementById('nav-clear-destination').hidden = false;
    try {
      const route = await getBikeRoute(userLocation, result);
      drawRoute(route.coordinates);
      document.getElementById('nav-route-summary').hidden = false;
      document.getElementById('nav-route-summary').textContent =
        `${(route.distanceMeters / 1000).toFixed(1)} km · ${Math.round(route.durationSeconds / 60)} min by bike`;
      syncControlsFromRide();
    } catch (e) {
      console.warn('Routing failed', e);
    }
  }

  return { init, syncControlsFromRide };
})();

window.GPS4BNav = GPS4BNav;
document.addEventListener('DOMContentLoaded', GPS4BNav.init);
