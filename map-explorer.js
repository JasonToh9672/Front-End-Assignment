(() => {
    'use strict';
    const el = id => document.getElementById(id);
    const apiKey = (window.foodMapConfig?.apiKey || '').trim();
    const map = L.map('map').setView([3.139, 101.6869], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const foodLayer = L.layerGroup().addTo(map);
    const startMarker = L.marker([3.139, 101.6869]).addTo(map).bindPopup('Route starting point');
    let start = { lat: 3.139, lon: 101.6869, name: 'Kuala Lumpur city centre (default)' };
    let destination = null;
    let routeLayer = null;
    let locationRevision = 0;
    const requests = new Map();
    const cancelled = () => new DOMException('Superseded', 'AbortError');
    const validPoint = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
    const message = (id, text) => { el(id).textContent = text; };

    function stopRequest(channel) {
        requests.get(channel)?.abort();
        requests.delete(channel);
    }

    async function api(channel, path, params) {
        if (!apiKey) throw new Error('Live map search is not available yet. Please try again later.');
        stopRequest(channel);
        const controller = new AbortController();
        requests.set(channel, controller);
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        const url = new URL(`https://api.geoapify.com/${path}`);
        url.search = new URLSearchParams({ ...params, apiKey });
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                if (response.status === 429) throw new Error('Map service is busy. Please wait a moment and try again.');
                if (response.status === 401 || response.status === 403) throw new Error('The map service is unavailable. Please try again later.');
                throw new Error('Could not load map information. Please try again.');
            }
            const data = await response.json();
            if (controller.signal.aborted) throw cancelled();
            return data;
        } catch (error) {
            if (timedOut) throw new Error('The map request timed out. Please try again.');
            if (error.name === 'TypeError') throw new Error('Unable to connect. Check your internet connection and try again.');
            throw error;
        } finally {
            clearTimeout(timeout);
            if (requests.get(channel) === controller) requests.delete(channel);
        }
    }

    function report(id, error) {
        if (error.name !== 'AbortError') message(id, error.message);
    }

    function clearRoute() {
        stopRequest('route');
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = null;
        destination = null;
        el('routeSteps').replaceChildren();
        el('clearRouteBtn').hidden = true;
        message('routeStatus', 'Select Directions on a food place to plan a route.');
    }

    function setStart(point) {
        if (!validPoint(point)) return;
        locationRevision++;
        start = point;
        clearRoute();
        startMarker.setLatLng([point.lat, point.lon]);
        message('currentLocationText', point.name);
    }

    function makeButton(label, action, className = 'btn btn-outline-primary btn-sm') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', action);
        return button;
    }

    function renderPlaces(places) {
        foodLayer.clearLayers();
        el('foodPlaces').replaceChildren();
        places.forEach(place => {
            const card = document.createElement('div');
            card.className = 'list-group-item';
            const title = document.createElement('h3');
            title.className = 'h6 mb-1';
            title.textContent = place.name;
            const address = document.createElement('p');
            address.className = 'small text-muted mb-2';
            address.textContent = place.address;
            const popup = document.createElement('div');
            const name = document.createElement('strong');
            name.textContent = place.name;
            popup.append(name, document.createElement('br'), makeButton('Directions', () => directions(place)));
            const marker = L.marker([place.lat, place.lon]).addTo(foodLayer).bindPopup(popup);
            const view = makeButton('Show on map', () => { map.setView([place.lat, place.lon], 16); marker.openPopup(); });
            view.classList.add('me-2');
            card.append(title, address, view, makeButton('Directions', () => directions(place)));
            el('foodPlaces').appendChild(card);
        });
    }

    async function nearby(point) {
        clearRoute();
        foodLayer.clearLayers();
        el('foodPlaces').replaceChildren();
        message('mapStatus', 'Looking for nearby food places…');
        try {
            const radius = el('searchRadius').value;
            const data = await api('places', 'v2/places', {
                categories: el('foodType').value,
                filter: `circle:${point.lon},${point.lat},${radius}`,
                bias: `proximity:${point.lon},${point.lat}`,
                limit: '20', lang: 'en'
            });
            const places = (data.features || []).map(f => ({
                lat: f.properties?.lat ?? f.geometry?.coordinates?.[1],
                lon: f.properties?.lon ?? f.geometry?.coordinates?.[0],
                name: f.properties?.name || 'Food place',
                address: f.properties?.formatted || 'Address unavailable'
            })).filter(validPoint);
            renderPlaces(places);
            message('mapStatus', places.length ? `Showing ${places.length} nearby food places within ${Number(radius) / 1000} km of the searched point.` : 'No food places found. Try a larger radius or a different area.');
        } catch (error) { report('mapStatus', error); }
    }

    function selectLocation(result, fallbackName) {
        const point = { lat: result.lat, lon: result.lon, name: result.formatted || fallbackName };
        setStart(point);
        map.setView([point.lat, point.lon], 14);
        return nearby(point);
    }

    async function search(event) {
        event.preventDefault();
        const text = el('locationSearch').value.trim();
        if (!text) return;
        stopRequest('places');
        message('mapStatus', 'Searching locations…');
        el('locationResults').replaceChildren();
        try {
            const data = await api('search', 'v1/geocode/search', { text, limit: '5', format: 'json', lang: 'en' });
            const results = (data.results || []).filter(validPoint);
            if (!results.length) {
                message('mapStatus', 'No locations found. Try a city name or a more complete address.');
                return;
            }
            results.slice(1).forEach(result => {
                el('locationResults').appendChild(makeButton(`Other match: ${result.formatted || text}`, () => {
                    stopRequest('search');
                    el('locationResults').replaceChildren();
                    selectLocation(result, text);
                }, 'list-group-item list-group-item-action'));
            });
            await selectLocation(results[0], text);
        } catch (error) { report('mapStatus', error); }
    }

    async function directions(place) {
        clearRoute();
        destination = place;
        const mode = el('travelMode').value;
        message('routeStatus', `Finding a route to ${place.name}…`);
        el('clearRouteBtn').hidden = false;
        try {
            const data = await api('route', 'v1/routing', {
                waypoints: `${start.lat},${start.lon}|${place.lat},${place.lon}`,
                mode, details: 'instruction_details', lang: 'en'
            });
            const route = data.features?.[0];
            if (!route?.geometry || !Number.isFinite(route.properties?.distance) || !Number.isFinite(route.properties?.time)) {
                throw new Error('No route found for this travel mode. Try another mode or a closer starting point.');
            }
            routeLayer = L.geoJSON(route, { style: { color: '#2563eb', weight: 5 } }).addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [35, 35] });
            const distance = (route.properties.distance / 1000).toFixed(1);
            const minutes = Math.max(1, Math.round(route.properties.time / 60));
            message('routeStatus', `${start.name} → ${place.name}: ${distance} km, approximately ${minutes} min (${mode === 'drive' ? 'driving' : mode === 'walk' ? 'walking' : 'cycling'}). Estimated travel time; not live traffic.`);
            for (const leg of route.properties.legs || []) {
                for (const step of leg.steps || []) {
                    if (!step.instruction?.text) continue;
                    const item = document.createElement('li');
                    item.textContent = step.instruction.text;
                    el('routeSteps').appendChild(item);
                }
            }
        } catch (error) { report('routeStatus', error); }
    }

    function mapCentre() {
        const centre = map.getCenter();
        return { lat: centre.lat, lon: centre.lng, name: `Map point (${centre.lat.toFixed(4)}, ${centre.lng.toFixed(4)})` };
    }

    el('locationSearchForm').addEventListener('submit', search);
    el('searchAreaBtn').addEventListener('click', () => nearby(mapCentre()));
    el('foodType').addEventListener('change', () => nearby(mapCentre()));
    el('searchRadius').addEventListener('change', () => nearby(mapCentre()));
    el('useMapStartBtn').addEventListener('click', () => { setStart(mapCentre()); message('mapStatus', 'Route starting point updated. Select Directions on a food place.'); });
    el('clearRouteBtn').addEventListener('click', clearRoute);
    el('travelMode').addEventListener('change', () => { if (destination) directions(destination); });
    el('myLocationBtn').addEventListener('click', () => {
        if (!navigator.geolocation) { message('mapStatus', 'Your browser does not support location access. Search for an address instead.'); return; }
        const revision = ++locationRevision;
        message('mapStatus', 'Waiting for your location permission…');
        navigator.geolocation.getCurrentPosition(position => {
            if (revision !== locationRevision) return;
            const point = { lat: position.coords.latitude, lon: position.coords.longitude, name: 'Your current location' };
            setStart(point);
            map.setView([point.lat, point.lon], 15);
            nearby(point);
        }, error => {
            if (revision !== locationRevision) return;
            message('mapStatus', error.code === 1 ? 'Location access was declined. Search for an address instead.' : 'Could not find your location. Try again or search for an address.');
        }, { timeout: 12000, maximumAge: 60000 });
    });
    el('saveLocationBtn').addEventListener('click', () => {
        try {
            localStorage.setItem('streetFood_mapView', JSON.stringify({ ...mapCentre(), zoom: map.getZoom() }));
            message('mapStatus', 'Map view saved for your next visit.');
        } catch { message('mapStatus', 'Your browser could not save this view.'); }
    });

    try {
        const saved = JSON.parse(localStorage.getItem('streetFood_mapView') || 'null');
        if (validPoint(saved) && Number.isFinite(saved.zoom)) {
            map.setView([saved.lat, saved.lon], Math.min(19, Math.max(2, saved.zoom)));
            setStart({ ...saved, name: 'Saved map centre' });
        }
    } catch { /* A corrupt or unavailable saved view must not block the map. */ }

    if (!apiKey) {
        renderPlaces((window.streetFoodLocations?.['kuala lumpur'] || []).map(p => ({ lat: p.lat, lon: p.lng, name: p.name, address: p.desc })));
        message('mapStatus', 'Showing selected Kuala Lumpur food spots. Live search and routing are not available yet.');
    } else {
        nearby(start);
    }
})();
