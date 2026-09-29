const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

class Element {
    constructor() { this.children = []; this.events = {}; this.value = ''; this.textContent = ''; this.classList = { add() {} }; }
    addEventListener(name, fn) { this.events[name] = fn; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); }
    replaceChildren(...nodes) { this.children = nodes; }
}

function app(key = 'test-browser-key') {
    const elements = new Map();
    const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    get('foodType').value = 'catering.restaurant';
    get('searchRadius').value = '3000';
    get('travelMode').value = 'walk';
    let centre = { lat: 3.139, lng: 101.6869 };
    let geoSuccess, geoFailure;
    const calls = [], responses = [], routes = [], saved = new Map();
    let initialRequest = true;
    const layer = () => ({ addTo() { return this; }, bindPopup() { return this; }, setLatLng() {}, openPopup() {}, clearLayers() {}, getBounds() { return {}; } });
    const map = { setView(coords) { centre = { lat: coords[0], lng: coords[1] }; return this; }, getCenter: () => centre, getZoom: () => 14, removeLayer() {}, fitBounds() {} };
    const context = {
        window: { foodMapConfig: { apiKey: key }, streetFoodLocations: {} },
        document: { getElementById: get, createElement: () => new Element() },
        navigator: { geolocation: { getCurrentPosition(ok, fail) { geoSuccess = ok; geoFailure = fail; } } },
        localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) },
        L: { map: () => map, tileLayer: layer, layerGroup: layer, marker: layer, geoJSON: data => { routes.push(data); return layer(); } },
        URL, URLSearchParams, AbortController, DOMException, setTimeout, clearTimeout,
        fetch: async (url, options) => {
            if (initialRequest) {
                initialRequest = false;
                assert.equal(new URL(url).pathname, '/v2/places');
                return { ok: true, json: async () => ({ features: [] }) };
            }
            calls.push({ url: new URL(url), options });
            const response = responses.shift();
            if (!response) throw Error('Unexpected request');
            return typeof response === 'function' ? response(options) : { ok: true, json: async () => response };
        }
    };
    vm.runInNewContext(fs.readFileSync('map-explorer.js', 'utf8'), context);
    return { get, calls, responses, routes, saved, geoSuccess: p => geoSuccess(p), geoFailure: p => geoFailure(p) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const place = { features: [{ properties: { lat: 3.15, lon: 101.7, name: '<img onerror=bad()>', formatted: 'Test address' } }] };

test('search selection finds food and uses correct coordinate order for directions', async () => {
    const a = app();
    await flush();
    a.get('locationSearch').value = 'Kuala Lumpur';
    a.responses.push({ results: [{ lat: 3.14, lon: 101.69, formatted: 'Kuala Lumpur' }] });
    await a.get('locationSearchForm').events.submit({ preventDefault() {} });
    assert.equal(a.calls[0].url.pathname, '/v1/geocode/search');
    assert.equal(a.calls[0].url.searchParams.get('text'), 'Kuala Lumpur');
    a.responses.push(place);
    a.get('locationResults').children[0].events.click();
    await flush();
    assert.equal(a.calls[1].url.searchParams.get('filter'), 'circle:101.69,3.14,3000');
    const card = a.get('foodPlaces').children[0];
    assert.equal(card.children[0].textContent, '<img onerror=bad()>'); // External names stay plain text.
    a.responses.push({ features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[101.69, 3.14], [101.7, 3.15]] }, properties: { distance: 1500, time: 900, legs: [{ steps: [{ instruction: { text: 'Turn left' } }] }] } }] });
    await card.children[3].events.click();
    assert.equal(a.calls[2].url.searchParams.get('waypoints'), '3.14,101.69|3.15,101.7');
    assert.equal(a.calls[2].url.searchParams.get('mode'), 'walk');
    assert.equal(a.routes.length, 1);
    assert.match(a.get('routeStatus').textContent, /1.5 km, approximately 15 min/);
    assert.equal(a.get('routeSteps').children[0].textContent, 'Turn left');
    a.get('clearRouteBtn').events.click();
    assert.equal(a.get('routeSteps').children.length, 0);
    assert.equal(a.get('clearRouteBtn').hidden, true);
});

test('empty search, missing key, rate limits and geolocation denial have clear feedback', async () => {
    const a = app();
    await flush();
    a.get('locationSearch').value = 'Nowhere';
    a.responses.push({ results: [] });
    await a.get('locationSearchForm').events.submit({ preventDefault() {} });
    assert.match(a.get('mapStatus').textContent, /No locations/);
    a.responses.push(() => ({ ok: false, status: 429 }));
    a.get('searchAreaBtn').events.click(); await flush();
    assert.match(a.get('mapStatus').textContent, /busy/);
    a.get('myLocationBtn').events.click(); a.geoFailure({ code: 1 });
    assert.match(a.get('mapStatus').textContent, /declined/);
    const b = app('');
    b.get('locationSearch').value = 'Penang';
    await b.get('locationSearchForm').events.submit({ preventDefault() {} });
    assert.equal(b.calls.length, 0);
    assert.match(b.get('mapStatus').textContent, /not available yet/);
});

test('new place request cancels the old response and saving persists the map view', async () => {
    const a = app();
    await flush();
    let resolveOld;
    a.responses.push(() => new Promise(resolve => { resolveOld = resolve; }));
    a.get('searchAreaBtn').events.click();
    a.responses.push(place);
    a.get('searchAreaBtn').events.click();
    await flush();
    assert.equal(a.calls[0].options.signal.aborted, true);
    resolveOld({ ok: true, json: async () => ({ features: [] }) });
    await flush();
    assert.equal(a.get('foodPlaces').children.length, 1);
    a.get('saveLocationBtn').events.click();
    assert.equal(JSON.parse(a.saved.get('streetFood_mapView')).zoom, 14);
});
