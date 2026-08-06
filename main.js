const initialZoom = 20;
const earthCircumference = 40e6;
const metersToDegrees = 360 / earthCircumference;

// CTC track colors — monochrome white-grey
const TRACK_COLOR = '#c8c8c8';
const TRACK_COLOR_DIM = '#555';
const TRACK_LABEL_COLOR = '#c8c8c8';

/////////////////////
// map

const canvasRenderer = L.canvas();
const mapBounds = [[0, 0], [0.15, 0.15]];
const maxBounds = [[-0.02, -0.02], [0.17, 0.17]];
const map = L.map('map', {
  minZoom: 13,
  maxBounds: maxBounds,
  tap: false,
  zoomControl: false,
})
.fitBounds(mapBounds);
L.control.scale().addTo(map);
const zoomHome = new L.Control.ZoomHome({
  position: 'topleft',
  zoomInText: '<i class="fas fa-search-plus"></i>',
  zoomHomeText: '<i class="fas fa-user"></i>',
  zoomHomeTitle: 'Zoom to player(s)',
  zoomOutText: '<i class="fas fa-search-minus"></i>',
}).addTo(map);

let markerToFollow;
map.addEventListener('mousedown', stopFollowing);
map.on('drag', () => { map.fitBounds(map.getBounds()); });
map.on('zoomanim', () => { map.fitBounds(map.getBounds()); });

function setMarkerToFollow(marker) {
  markerToFollow = marker;
  map.panTo(marker.getBounds().getCenter());
}

function stopFollowing() {
  markerToFollow = undefined;
}

function zoomToAllPlayers() {
  const bounds = new L.LatLngBounds();
  playerMarkers.forEach(marker => bounds.extend(marker.getBounds()));
  map.fitBounds(bounds, { maxZoom: initialZoom });
}

map.addEventListener('zoomhome', () => {
  stopFollowing();
  zoomToAllPlayers();
});

/////////////////////
// connection status

const connectionIndicator = document.getElementById('connectionStatus');
let connectionOk = true;
let consecutiveFailures = 0;

function setConnectionStatus(ok) {
  if (ok === connectionOk) return;
  connectionOk = ok;
  if (ok) {
    connectionIndicator.classList.remove('disconnected');
    connectionIndicator.classList.add('connected');
    connectionIndicator.title = 'Connected';
    connectionIndicator.innerHTML = '<i class="fas fa-wifi"></i>';
    consecutiveFailures = 0;
  } else {
    connectionIndicator.classList.remove('connected');
    connectionIndicator.classList.add('disconnected');
    connectionIndicator.title = 'Connection lost — retrying...';
    connectionIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
  }
}

/////////////////////
// settings

document.getElementById('themeDropdown')
  .addEventListener('input', e => {
    document.getElementById('map').classList.toggle('dark', e.target.value === 'dark');
    localStorage.setItem('dv-dispatch-theme', e.target.value);
  });

const savedTheme = localStorage.getItem('dv-dispatch-theme');
if (savedTheme) {
  document.getElementById('themeDropdown').value = savedTheme;
  if (savedTheme === 'light') document.getElementById('map').classList.remove('dark');
}

function getCarColorMode() {
  return document.getElementById('carColorDropdown').value;
}

document.getElementById('carColorDropdown')
  .addEventListener('input', (e) => {
    updateAllCarColors();
    updateJobListColors();
    localStorage.setItem('dv-dispatch-carColor', e.target.value);
  });

const savedCarColor = localStorage.getItem('dv-dispatch-carColor');
if (savedCarColor) document.getElementById('carColorDropdown').value = savedCarColor;

/////////////////////
// sidebar

const sidebar = L.control.sidebar({ autopan: true, container: 'sidebar' }).addTo(map);
const tablesort = new Tablesort(document.getElementById('carList'));
const carListBody = document.getElementById('carListBody');

function createCarRow(carId) {
  const row = document.createElement('tr');
  row.setAttribute('id', `carList-${carId}`);
  row.classList.add('interactive');
  carListBody.append(row);
  updateCarRow(carId);
  row.addEventListener('click', _ => followCar(carId, false));
}

function removeCarRow(carId) {
  const row = document.getElementById(`carList-${carId}`);
  if (row) row.remove();
}

function updateCarRow(carId) {
  const row = document.getElementById(`carList-${carId}`);
  if (!row) return;
  const jobId = carJobIds.has(carId) ? carJobIds.get(carId) : '';
  const destinationYardId = allJobData.has(jobId) ? allJobData.get(jobId).destinationYardId : '';
  row.innerHTML = `<td>${carId}</td><td>${jobId}</td><td>${destinationYardId}</td>`;
  tablesort.refresh();
}

function updateCarStats() {
  const total = allCarData.size;
  let locos = 0;
  for (const [id] of allCarData) { if (id.startsWith('L-')) locos++; }
  document.getElementById('carCount').textContent = `${total} cars`;
  document.getElementById('locoCount').textContent = `${locos} locos`;
}

const carSearchInput = document.getElementById('carSearchText');
let carSearchTimeoutId;
function filterCarList() {
  const query = carSearchInput.value.toUpperCase();
  for (const row of carListBody.children) {
    row.style.display = row.textContent.toUpperCase().includes(query) ? '' : 'none';
  }
}
carSearchInput.addEventListener('input', () => {
  if (carSearchTimeoutId) clearTimeout(carSearchTimeoutId);
  carSearchTimeoutId = setTimeout(filterCarList, 100);
});

/////////////////////
// jobs

const CarsPerRow = 3;
const allJobData = new Map();
const carJobIds = new Map();
const jobListBody = document.getElementById('jobListBody');

function stringHash(str) {
  let hash = 5381, i = str.length;
  while(i) { hash = (hash * 33) ^ str.charCodeAt(--i); }
  return hash >>> 0;
}

const carColors = [
  '#52ef99', '#c95e9f', '#b1e632', '#7574f5', '#799d10', '#fd3fbe', '#2cf52b', '#d130ff', '#21a708', '#fd2b31',
  '#3eeaef', '#ffc4de', '#069668', '#f9793b', '#5884c9', '#e5d75e', '#96ccfe', '#bb8801', '#6a8b7b', '#a8777c',
];

function colorByHashing(str) { return carColors[stringHash(str) % carColors.length]; }

function colorForJobDestination(jobId) {
  const jobData = allJobData.get(jobId);
  return jobData ? colorForYardId(jobData.destinationYardId) : 'gray';
}

function colorForJobType(jobId) {
  const segments = jobId.split('-');
  if (segments.length == 2) return 'cornflowerblue';
  switch (segments[1]) {
    case 'FH': return 'lightgreen';
    case 'LH': return 'khaki';
    case 'PC': case 'PE': return 'cornflowerblue';
    case 'PR': return 'mediumpurple';
    case 'SL': case 'SU': return 'lightcoral';
  }
}

function colorForJobId(jobId) {
  switch (getCarColorMode()) {
    case 'jobId': return colorByHashing(jobId);
    case 'carType': case 'jobType': return colorForJobType(jobId);
    case 'destination': return colorForJobDestination(jobId);
  }
}

function yardIdForTrack(trackId) { return trackId.split('-')[0]; }

function jobMatchesFilter(jobId, jobData) {
  const testText = document.getElementById('jobSearchText').value.toUpperCase();
  const activeOnly = document.getElementById('jobActiveOnly').checked;
  function taskFields(task) { return [task.startTrack, task.destinationTrack].concat(task.cars); }
  const fields = [jobId].concat(jobData.tasks.flatMap(taskFields));
  return fields.some(field => field.includes(testText)) && (!activeOnly || jobData.isActive);
}

function jobElem(jobId, jobData) {
  function replaceHyphens(s) { return s.replaceAll('-', '\u2011'); }

  const tbody = document.createElement('tbody');
  tbody.setAttribute('id', `jobList-${jobId}`);

  let row = document.createElement('tr');
  const jobIdCell = document.createElement('th');
  jobIdCell.setAttribute('colspan', CarsPerRow);
  jobIdCell.classList.add("jobList-jobHeader");
  jobIdCell.style.background = colorForJobId(jobId);
  jobIdCell.textContent = jobId;

  const jobLicensesDiv = document.createElement('div');
  jobLicensesDiv.classList.add('jobList-licenses');
  for (const license of jobData.requiredLicenses) {
    jobLicensesDiv.innerHTML += `<span class="jobList-license"><div class="jobList-licenseBackground"></div><img src="res/licenses.${license}.png" title="${license}"></span>`;
  }
  jobIdCell.appendChild(jobLicensesDiv);
  row.appendChild(jobIdCell);
  tbody.appendChild(row);

  row = document.createElement('tr');
  const jobMassCell = document.createElement('th');
  jobMassCell.textContent = `${jobData.mass.toFixed(0)} t`;
  const jobLengthCell = document.createElement('th');
  jobLengthCell.textContent = `${jobData.length.toFixed(0)} m`;
  const jobPaymentCell = document.createElement('th');
  jobPaymentCell.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(jobData.basePayment);
  row.append(jobMassCell, jobLengthCell, jobPaymentCell);
  tbody.appendChild(row);

  jobData.tasks.forEach(task => {
    row = document.createElement('tr');
    const startTrackCell = document.createElement('th');
    startTrackCell.classList.add('interactive');
    startTrackCell.textContent = replaceHyphens(task.startTrack);
    startTrackCell.style.background = colorForYardId(yardIdForTrack(task.startTrack));
    startTrackCell.addEventListener('click', () => scrollToTrack(task.startTrack));
    row.appendChild(startTrackCell);

    const arrowCell = document.createElement('th');
    arrowCell.textContent = "\u279C";
    arrowCell.classList.add('jobList-trackSeparator');
    row.appendChild(arrowCell);

    const destinationTrackCell = document.createElement('th');
    destinationTrackCell.classList.add('interactive');
    destinationTrackCell.textContent = replaceHyphens(task.destinationTrack);
    destinationTrackCell.style.background = colorForYardId(yardIdForTrack(task.destinationTrack));
    destinationTrackCell.addEventListener('click', () => scrollToTrack(task.destinationTrack));
    row.appendChild(destinationTrackCell);

    for (let carIndex = 0; carIndex < task.cars.length; carIndex++) {
      if (carIndex % CarsPerRow == 0) { tbody.appendChild(row); row = document.createElement('tr'); }
      const carId = task.cars[carIndex];
      const carCell = document.createElement('td');
      carCell.classList.add(`jobList-carCell-${carId}`, 'interactive');
      carCell.textContent = carId;
      carCell.addEventListener('click', () => followCar(carId, false));
      row.appendChild(carCell);
    }
    if (row.children.length < CarsPerRow)
      for (let i = 0; i < CarsPerRow - (task.cars.length % CarsPerRow); i++)
        row.appendChild(document.createElement('td'));
    tbody.appendChild(row);
  });
  return tbody;
}

function updateCarJobs() {
  carJobIds.clear();
  allJobData.forEach((jobData, jobId) => {
    jobData.tasks.forEach(task => {
      task.cars.forEach(carId => { carJobIds.set(carId, jobId); });
    })
  });
  for (const [carId] of allCarData) { updateCarRow(carId); updateCarMarker(carId); }
}

function updateJobListColors() {
  for (const elem of jobListBody.querySelectorAll('th.jobList-jobHeader'))
    elem.style.background = colorForJobId(elem.textContent);
}

function updateJobStats() {
  let active = 0;
  allJobData.forEach(j => { if (j.isActive) active++; });
  document.getElementById('jobCount').textContent = `${allJobData.size} jobs`;
  document.getElementById('activeJobCount').textContent = `${active} active`;
}

function updateJobList() {
  for (const elem of Array.from(jobListBody.childNodes)) elem.remove();
  Array.from(allJobData.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([jobId, jobData]) => jobMatchesFilter(jobId, jobData))
    .forEach(([jobId, jobData]) => jobListBody.appendChild(jobElem(jobId, jobData)));
}

function updateAllJobs(jobs) {
  allJobData.clear();
  Object.entries(jobs).forEach(([jobId, jobData]) => allJobData.set(jobId, jobData));
  updateJobList();
  updateJobStats();
  updateCarJobs();
}

let jobSearchTimeoutId;
function queueJobUpdate() {
  if (jobSearchTimeoutId) clearTimeout(jobSearchTimeoutId);
  jobSearchTimeoutId = setTimeout(updateJobList, 100);
}
document.getElementById('jobSearchText').addEventListener('input', queueJobUpdate);
document.getElementById('jobActiveOnly').addEventListener('change', queueJobUpdate);

/////////////////////
// track — CTC monochrome style

const trackPolyLines = new Map();

const yardInfo = {
  'CME':  { name: 'Coal Mine East',      color: '#686868' },
  'CMS':  { name: 'Coal Mine South',     color: '#4e554e' },
  'CP':   { name: 'City Power Plant',    color: '#583d3d' },
  'CS':   { name: 'City South',          color: '#97adc2' },
  'CW':   { name: 'City West',           color: '#a7a7a7' },
  'FF':   { name: 'Food Factory',        color: '#77a6e3' },
  'FM':   { name: 'Farm',                color: '#ddaa4d' },
  'FRC':  { name: 'Forest Central',      color: '#92b66a' },
  'FRS':  { name: 'Forest South',        color: '#609161' },
  'GF':   { name: 'Goods Factory',       color: '#c97fa2' },
  'HB':   { name: 'Harbor',              color: '#816c94' },
  'HMB':  { name: 'Harbor Maintenance',  color: '#816c94' },
  'IME':  { name: 'Iron Mine East',      color: '#b66861' },
  'IMW':  { name: 'Iron Mine West',      color: '#9a5847' },
  'MB':   { name: 'Machine Bay',         color: '#988c5f' },
  'MF':   { name: 'Machine Factory',     color: '#dc885b' },
  'MFMB': { name: 'Machine Factory Bay', color: '#dc885b' },
  'OR':   { name: 'Oil Refinery',        color: '#935478' },
  'OWC':  { name: 'Oil Well Central',    color: '#555a62' },
  'OWN':  { name: 'Oil Well North',      color: '#625d55' },
  'SM':   { name: 'Steel Mill',          color: '#7b8394' },
  'SW':   { name: 'Sawmill',             color: '#cda888' },
};

// colorForYardId used only for sidebar job task cells, not for tracks
function colorForYardId(yardId) { return yardInfo[yardId]?.color; }

function createTrackLabel(trackId, position, angle) {
  const size = 0.0002;
  const bounds = [[position[0] - size, position[1] - size], [position[0] + size, position[1] + size]];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', trackId);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', '-50 -10 100 20');
  svg.innerHTML = `<text text-anchor="middle" dominant-baseline="central" transform="rotate(${-angle})" font-family="${getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'Consolas, monospace'}" font-weight="bold" font-size="9" fill="${TRACK_LABEL_COLOR}" stroke="#000" stroke-width="0.3px">${trackId.slice(trackId.indexOf('-') + 1)}</text>`;
  L.svgOverlay(svg, bounds, { renderer: canvasRenderer }).addTo(map).setZIndex(1000);
}

function pointDistance(p1, p2) {
  const d0 = p1[0] - p2[0], d1 = p1[1] - p2[1];
  return Math.sqrt(d0 * d0 + d1 * d1);
}

function pointLerp(p1, p2, a) {
  return [(p2[0] - p1[0]) * a + p1[0], (p2[1] - p1[1]) * a + p1[1]];
}

function createLocation(start, end, mid, a) {
  return [(end[0] - start[0]) * a + mid[0], (end[1] - start[1]) * a + mid[1]];
}

function createTrackLabels(trackId, coords) {
  const length = pointDistance(coords[0], coords[coords.length - 1]);
  const midIndex = Math.floor(coords.length / 2);
  const beforeMid = (midIndex % 2 == 1) ? coords[midIndex] : coords[midIndex - 1];
  const mid = (midIndex % 2 == 1) ? coords[midIndex] : pointLerp(coords[midIndex - 1], coords[midIndex], 0.5);
  const afterMid = (midIndex % 2 == 1) ? coords[midIndex + 1] : coords[midIndex];
  const midGap = pointDistance(beforeMid, afterMid);
  const angle = ((Math.atan2(afterMid[0] - beforeMid[0], afterMid[1] - beforeMid[1]) * 180 / Math.PI) + 270) % 180 - 90;

  if (coords.length > 5) {
    createTrackLabel(trackId, createLocation(beforeMid, afterMid, mid, length / midGap * 0.3), angle);
    createTrackLabel(trackId, createLocation(beforeMid, afterMid, mid, length / midGap * -0.3), angle);
  } else {
    createTrackLabel(trackId, mid, angle);
  }
}

/////////////////////
// yard labels

const yardLabelLayer = L.layerGroup().addTo(map);
const yardCenters = new Map();

function computeYardCenters(tracks) {
  const yardPoints = {};
  Object.entries(tracks).forEach(([trackId, coords]) => {
    const yardId = yardIdForTrack(trackId);
    if (!yardInfo[yardId]) return;
    if (!yardPoints[yardId]) yardPoints[yardId] = [];
    const mid = coords[Math.floor(coords.length / 2)];
    if (mid) yardPoints[yardId].push(mid);
  });
  Object.entries(yardPoints).forEach(([yardId, points]) => {
    const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
    const lon = points.reduce((s, p) => s + p[1], 0) / points.length;
    yardCenters.set(yardId, [lat, lon]);
  });
}

function createYardLabels() {
  yardCenters.forEach((pos, yardId) => {
    const info = yardInfo[yardId];
    if (!info) return;
    const icon = L.divIcon({
      className: 'yard-label',
      html: `<div class="yard-label-inner" style="--yard-color: ${info.color}">
               <span class="yard-label-name">${info.name}</span>
               <span class="yard-label-code">${yardId}</span>
             </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    L.marker(pos, { icon, interactive: false, zIndexOffset: -1000 }).addTo(yardLabelLayer);
  });
}

let yardLabelZoomClass = '';
function updateYardLabelVisibility() {
  const zoom = map.getZoom();
  let newClass;
  if (zoom <= 15.5) newClass = 'yard-labels-full';
  else if (zoom <= 17) newClass = 'yard-labels-fade';
  else newClass = 'yard-labels-hidden';

  if (newClass !== yardLabelZoomClass) {
    yardLabelZoomClass = newClass;
    const container = document.getElementById('map');
    container.classList.remove('yard-labels-full', 'yard-labels-fade', 'yard-labels-hidden');
    container.classList.add(newClass);
  }
}

map.on('zoomend', updateYardLabelVisibility);
map.on('zoom', updateYardLabelVisibility);

let cachedTrackData = null;

const tracksReady = fetch(new URL('/track', location))
.then(resp => resp.json())
.then(tracks => {
  cachedTrackData = tracks;
  Object.entries(tracks).forEach(([trackId, coords]) => {
    const isSiding = !trackId.includes('#');
    // CTC style: all tracks uniform white-grey, sidings slightly brighter than through-tracks
    const polyline = L.polyline(coords, {
      color: isSiding ? TRACK_COLOR : '#999',
      weight: isSiding ? 2.5 : 1.5,
      interactive: false,
      renderer: canvasRenderer,
    }).addTo(map);
    trackPolyLines.set(trackId, polyline);
    if (isSiding) createTrackLabels(trackId, coords);
  });
  computeYardCenters(tracks);
  createYardLabels();
  updateYardLabelVisibility();
});

/////////////////////
// junctions — CTC triangle arrowhead design

let junctions = [];
const junctionsReady = tracksReady
.then(_ => fetch(new URL('/junction', location)))
.then(resp => resp.json())
.then(allJunctionData =>
  junctions = allJunctionData.map((data, index) => ({
    marker: createJunctionMarker(data.position, index),
    branches: data.branches,
    selectedBranch: null,
    animating: false,
  }))
);

function toggleJunction(junctionId) {
  const junction = junctions[junctionId];
  if (junction.animating) return;
  fetch(new URL(`/junction/${junctionId}/toggle`, location), { method: 'POST' })
  .then(resp => resp.json())
  .then(selectedBranch => animateJunctionSwitch(junctionId, selectedBranch))
  .catch(() => {});
}

// Triangle junction SVG — solid arrowhead at convergence point
const jSize = 16;

function createJunctionOverlay(junctionId) {
  const s = jSize;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', `J-${junctionId}`);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', `${-s*1.5} ${-s*1.5} ${s*3} ${s*3}`);

  // Main rail line (straight through)
  // Diverging rail line (angled)
  // Triangle arrowhead at convergence
  // Junction ID label
  svg.innerHTML = `
    <g class="junction-group" id="jg-${junctionId}">
      <line class="j-main-rail" x1="0" y1="${s*1.2}" x2="0" y2="${-s*1.2}"
            stroke="${TRACK_COLOR}" stroke-width="2.5" stroke-linecap="round"/>
      <line class="j-diverge-rail" id="jdr-${junctionId}"
            x1="0" y1="${s*0.4}" x2="${-s*0.8}" y2="${-s*1.2}"
            stroke="${TRACK_COLOR_DIM}" stroke-width="2.5" stroke-linecap="round"/>
      <polygon class="j-triangle" id="jt-${junctionId}"
               points="0,${s*0.5} ${-s*0.45},${-s*0.15} ${s*0.45},${-s*0.15}"
               fill="${TRACK_COLOR}" stroke="none"/>
      <text class="j-label" x="${s*0.7}" y="${s*0.15}" text-anchor="start"
            font-size="7" font-family="Consolas,Monaco,monospace" font-weight="600"
            fill="#888">${junctionId}</text>
    </g>`;
  return svg;
}

function getDivergeEndpoint(branch) {
  // Branch 0 = diverge left, Branch 1 = diverge right
  const angle = branch === 0 ? -40 : branch === 1 ? 40 : 0;
  const rad = angle * Math.PI / 180;
  return {
    x: Math.sin(rad) * jSize * 1.2,
    y: -jSize * 1.2,
  };
}

function animateJunctionSwitch(junctionId, newBranch) {
  const junction = junctions[junctionId];
  const oldBranch = junction.selectedBranch;
  junction.animating = true;

  const divergeRail = document.getElementById(`jdr-${junctionId}`);
  const triangle = document.getElementById(`jt-${junctionId}`);
  if (!divergeRail) { junction.animating = false; junction.selectedBranch = newBranch; return; }

  const startEnd = getDivergeEndpoint(oldBranch ?? newBranch);
  const targetEnd = getDivergeEndpoint(newBranch);

  const duration = 350;
  const startTime = performance.now();

  // Flash brightness — momentary white
  if (triangle) triangle.setAttribute('fill', '#ffffff');
  divergeRail.setAttribute('stroke', '#ffffff');

  function frame(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    // Spring easing with subtle overshoot
    const spring = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 1.1);
    const eased = Math.min(spring, 1.03);

    const cx = startEnd.x + (targetEnd.x - startEnd.x) * eased;
    const cy = startEnd.y + (targetEnd.y - startEnd.y) * eased;
    divergeRail.setAttribute('x2', cx);
    divergeRail.setAttribute('y2', cy);

    // Fade brightness back during animation
    if (t > 0.3) {
      const fade = Math.min((t - 0.3) / 0.4, 1);
      const c = Math.round(200 + (200 - 200) * fade); // stays at #c8c8c8
      const grey = `rgb(${Math.round(255 - (255 - 200) * fade)},${Math.round(255 - (255 - 200) * fade)},${Math.round(255 - (255 - 200) * fade)})`;
      if (triangle) triangle.setAttribute('fill', grey);
      divergeRail.setAttribute('stroke', grey);
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      // Final position
      divergeRail.setAttribute('x2', targetEnd.x);
      divergeRail.setAttribute('y2', targetEnd.y);
      junction.selectedBranch = newBranch;

      // Set final colors
      if (triangle) triangle.setAttribute('fill', TRACK_COLOR);
      divergeRail.setAttribute('stroke', TRACK_COLOR);

      // Update track polyline styles
      updateJunctionTrackStyles(junctionId, newBranch);

      setTimeout(() => { junction.animating = false; }, 50);
    }
  }

  requestAnimationFrame(frame);
}

function updateJunctionTrackStyles(junctionId, selectedBranch) {
  const junction = junctions[junctionId];
  const selectedTrackId = junction.branches[selectedBranch];
  const unselectedTrackId = junction.branches[1 - selectedBranch];
  // CTC style: active branch = full white-grey, inactive = dimmed
  if (selectedTrackId && trackPolyLines.has(selectedTrackId))
    trackPolyLines.get(selectedTrackId).setStyle({ color: TRACK_COLOR, dashArray: null });
  if (unselectedTrackId && trackPolyLines.has(unselectedTrackId))
    trackPolyLines.get(unselectedTrackId).setStyle({ color: TRACK_COLOR_DIM, dashArray: null }).bringToBack();
}

function setJunctionVisual(junctionId, branch) {
  const divergeRail = document.getElementById(`jdr-${junctionId}`);
  if (!divergeRail) return;
  const end = getDivergeEndpoint(branch);
  divergeRail.setAttribute('x2', end.x);
  divergeRail.setAttribute('y2', end.y);
  divergeRail.setAttribute('stroke', TRACK_COLOR);
  const triangle = document.getElementById(`jt-${junctionId}`);
  if (triangle) triangle.setAttribute('fill', TRACK_COLOR);
  updateJunctionTrackStyles(junctionId, branch);
}

function getJunctionOverlayBounds(position) {
  const size = metersToDegrees * 5;
  return [[position[0] - size, position[1] - size/2], [position[0] + size, position[1] + size/2]];
}

function createJunctionMarker(p, junctionId) {
  return L.svgOverlay(
    createJunctionOverlay(junctionId),
    getJunctionOverlayBounds(p),
    { interactive: true, renderer: canvasRenderer })
    .addEventListener('click', () => toggleJunction(junctionId))
    .addTo(map)
    .setZIndex(Math.floor(p[0] * 100000 + p[1] * 100000));
}

function updateAllJunctions(states) {
  states.forEach((state, index) => {
    const junction = junctions[index];
    if (junction && !junction.animating) {
      junction.selectedBranch = state;
      setJunctionVisual(index, state);
    }
  });
}

/////////////////////
// minimap

const minimapEl = document.getElementById('minimap');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapViewport = document.getElementById('minimapViewport');
let minimapTrackData = null;
let minimapBoundsMin = [Infinity, Infinity];
let minimapBoundsMax = [-Infinity, -Infinity];
let minimapReady = false;

function initMinimap(tracks) {
  minimapTrackData = tracks;
  Object.values(tracks).forEach(coords => {
    coords.forEach(([lat, lon]) => {
      if (lat < minimapBoundsMin[0]) minimapBoundsMin[0] = lat;
      if (lon < minimapBoundsMin[1]) minimapBoundsMin[1] = lon;
      if (lat > minimapBoundsMax[0]) minimapBoundsMax[0] = lat;
      if (lon > minimapBoundsMax[1]) minimapBoundsMax[1] = lon;
    });
  });
  drawMinimapTracks();
  minimapReady = true;
  updateMinimapViewport();
  minimapEl.style.opacity = '1';
}

function getMinimapScale(w, h) {
  const pad = 8;
  const rangeX = minimapBoundsMax[1] - minimapBoundsMin[1];
  const rangeY = minimapBoundsMax[0] - minimapBoundsMin[0];
  if (rangeX <= 0 || rangeY <= 0) return { scale: 1, pad };
  return { scale: Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeY), pad };
}

function drawMinimapTracks() {
  if (!minimapTrackData) return;
  const canvas = minimapCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width = canvas.offsetWidth * dpr;
  const h = canvas.height = canvas.offsetHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const { scale, pad } = getMinimapScale(w, h);

  Object.entries(minimapTrackData).forEach(([trackId, coords]) => {
    if (coords.length < 2) return;
    const isSiding = !trackId.includes('#');
    ctx.strokeStyle = isSiding ? 'rgba(200, 200, 200, 0.6)' : 'rgba(150, 150, 150, 0.3)';
    ctx.lineWidth = isSiding ? 1.5 * dpr : 0.75 * dpr;
    ctx.beginPath();
    coords.forEach(([lat, lon], i) => {
      const x = pad + (lon - minimapBoundsMin[1]) * scale;
      const y = h - pad - (lat - minimapBoundsMin[0]) * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function updateMinimapViewport() {
  if (!minimapReady) return;
  const w = minimapCanvas.offsetWidth;
  const h = minimapCanvas.offsetHeight;
  const { scale, pad } = getMinimapScale(w, h);
  const b = map.getBounds();
  const x1 = pad + (b.getWest() - minimapBoundsMin[1]) * scale;
  const y1 = h - pad - (b.getNorth() - minimapBoundsMin[0]) * scale;
  const x2 = pad + (b.getEast() - minimapBoundsMin[1]) * scale;
  const y2 = h - pad - (b.getSouth() - minimapBoundsMin[0]) * scale;
  const vp = minimapViewport;
  vp.style.left = `${Math.max(0, x1)}px`;
  vp.style.top = `${Math.max(0, y1)}px`;
  vp.style.width = `${Math.max(4, Math.min(w, x2 - x1))}px`;
  vp.style.height = `${Math.max(4, Math.min(h, y2 - y1))}px`;
}

map.on('moveend zoomend', updateMinimapViewport);

minimapEl.addEventListener('click', e => {
  if (!minimapReady) return;
  const rect = minimapCanvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  const { scale, pad } = getMinimapScale(w, h);
  const lon = (e.clientX - rect.left - pad) / scale + minimapBoundsMin[1];
  const lat = (h - pad - (e.clientY - rect.top)) / scale + minimapBoundsMin[0];
  stopFollowing();
  map.panTo([lat, lon]);
});

tracksReady.then(() => {
  if (cachedTrackData) initMinimap(cachedTrackData);
});

/////////////////////
// following

function followCar(carId, shouldScroll) {
  setMarkerToFollow(carMarkers.get(carId));
  for (const row of carListBody.querySelectorAll('.following')) row.classList.remove('following');
  const carListRow = document.getElementById(`carList-${carId}`);
  carListRow.classList.add('following');
  if (shouldScroll) carListRow.scrollIntoView({ block: 'center' });

  for (const elem of jobListBody.querySelectorAll('.following')) elem.classList.remove('following');
  const jobListElems = jobListBody.querySelectorAll(`.jobList-carCell-${carId}`);
  for (const elem of jobListElems) {
    elem.classList.add('following');
    elem.closest('tbody').classList.add('following');
  }
  if (shouldScroll && jobListElems.length > 0) jobListElems[0].scrollIntoView({ block: 'center' });
}

/////////////////////
// player

const playerMarkers = new Map();

function getPlayerOverlayBounds(position) {
  const size = metersToDegrees * 2;
  return [[position[0] - size, position[1] - size], [position[0] + size, position[1] + size]];
}

function updatePlayerOverlays(data) {
  const existingPlayerIds = Array.from(playerMarkers.keys());
  existingPlayerIds.filter(id => !data.hasOwnProperty(id)).forEach(id => removePlayerOverlay(id));
  Object.entries(data).filter(([id]) => !existingPlayerIds.includes(id)).forEach(([id, pd]) => createPlayerMarker(id, pd));
  Object.entries(data).forEach(([id, pd]) => {
    const el = document.getElementById(`playerPolygon-${id}`);
    if (el) el.setAttribute('transform', `rotate(${pd.rotation})`);
    const marker = playerMarkers.get(id);
    if (marker) marker.setBounds(getPlayerOverlayBounds(pd.position));
  });
}

function removePlayerOverlay(id) {
  const marker = playerMarkers.get(id);
  if (marker) { marker.remove(); playerMarkers.delete(id); }
}

function createPlayerOverlay(id, playerData) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-15 -15 30 30');
  const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
  polygon.setAttribute('id', `playerPolygon-${id}`);
  polygon.setAttribute('fill', playerData.color);
  polygon.setAttribute('fill-opacity', '70%');
  polygon.setAttribute('stroke', 'black');
  polygon.setAttribute('stroke-width', '1%');
  polygon.setAttribute('points', '0,-10 10,10 0,5 -10,10');
  svg.appendChild(polygon);
  return svg;
}

function createPlayerMarker(id, playerData) {
  playerMarkers.set(id, L.svgOverlay(
    createPlayerOverlay(id, playerData),
    getPlayerOverlayBounds(playerData.position),
    { interactive: true, bubblingMouseEvents: false })
    .addEventListener('click', e => setMarkerToFollow(e.target))
    .addTo(map));
}

function scrollToTrack(trackId) {
  stopFollowing();
  const polyLine = trackPolyLines.get(trackId);
  if (polyLine) map.panTo(polyLine.getCenter());
}

fetch(new URL('/player', location))
.then(resp => resp.json())
.then(data => { updatePlayerOverlays(data); zoomToAllPlayers(); });

/////////////////////
// loco control

const locoIdSelect = document.getElementById('locoControlLocoId');
function updateLocoList() {
  for (const elem of Array.from(locoIdSelect.children)) elem.remove();
  const locoIds = Array.from(allCarData.entries())
    .filter(([_, cd]) => cd.canBeControlled).map(([id]) => id.slice(2));
  locoIds.sort();
  for (const id of locoIds) {
    const option = document.createElement('option');
    option.textContent = id;
    locoIdSelect.appendChild(option);
  }
}

function isReverserButtonActive(btn) {
  return btn.querySelector('svg')?.getAttribute('data-prefix') === 'fas';
}

const reverserIndicator = document.getElementById('reverserIndicator');
const reverseButton = document.getElementById('locoControlReverserReverseButton');
const forwardButton = document.getElementById('locoControlReverserForwardButton');

function updateReverserButtons(reverser) {
  const ri = reverseButton.querySelector('svg');
  if (ri) ri.setAttribute('data-prefix', reverser < 0.5 ? 'fas' : 'far');
  const fi = forwardButton.querySelector('svg');
  if (fi) fi.setAttribute('data-prefix', reverser > 0.5 ? 'fas' : 'far');
  reverseButton.classList.toggle('active', reverser < 0.5);
  forwardButton.classList.toggle('active', reverser > 0.5);
  reverserIndicator.textContent = reverser < 0.4 ? 'R' : reverser > 0.6 ? 'F' : 'N';
}

const locoBrakePipeDisplay = document.getElementById('locoControlBrakePipe');
const locoSpeedDisplay = document.getElementById('locoControlForwardSpeed');
const locoTrainBrakeInput = document.getElementById('locoControlTrainBrakeInput');
const locoIndependentBrakeInput = document.getElementById('locoControlIndependentBrakeInput');
const locoThrottleInput = document.getElementById('locoControlThrottleInput');
const locoControlCoupleButton = document.getElementById('locoControlCoupleButton');
const locoControlUncoupleButton = document.getElementById('locoControlUncoupleButton');
const locoControlUncoupleSelect = document.getElementById('locoControlUncoupleSelect');
const throttleValueDisplay = document.getElementById('throttleValue');
const trainBrakeValueDisplay = document.getElementById('trainBrakeValue');
const indepBrakeValueDisplay = document.getElementById('indepBrakeValue');
const slipIndicator = document.getElementById('slipIndicator');

function updateCouplingControls(carData) {
  locoControlCoupleButton.disabled = !carData.canCouple;
  locoControlUncoupleButton.disabled = carData.carsInFront == 0 && carData.carsInRear == 0;
  if (locoControlUncoupleSelect.childElementCount == carData.carsInFront + carData.carsInRear) return;
  const options = [];
  for (let i = carData.carsInFront; i >= 1; i--) options.push(i);
  for (let i = 1; i <= carData.carsInRear; i++) options.push(-i);
  locoControlUncoupleSelect.replaceChildren(...options.map(i => {
    const o = document.createElement('option');
    o.setAttribute('value', i);
    o.textContent = i >= 0 ? `\u002b${i}` : `\u2212${-i}`;
    return o;
  }));
}

function getControlledLocoGuid() { return allCarData.get(`L-${locoIdSelect.value}`)?.guid; }
function getControlledLocoData() {
  const guid = getControlledLocoGuid();
  if (guid) return fetch(`/car/${guid}`, location).then(r => r.json());
}

let locoTrainBrakeEditing = false, locoIndependentBrakeEditing = false, locoThrottleEditing = false;

function updateLocoDisplay() {
  const p = getControlledLocoData();
  if (!p) return;
  p.then(cd => {
    locoBrakePipeDisplay.textContent = cd.brakePipe.toFixed(1);
    locoSpeedDisplay.textContent = cd.forwardSpeed.toFixed(0);
    if (!locoTrainBrakeEditing) { locoTrainBrakeInput.value = cd.trainBrake * 100; trainBrakeValueDisplay.textContent = `${Math.round(cd.trainBrake * 100)}%`; }
    if (!locoIndependentBrakeEditing) { locoIndependentBrakeInput.value = cd.independentBrake * 100; indepBrakeValueDisplay.textContent = `${Math.round(cd.independentBrake * 100)}%`; }
    if (!locoThrottleEditing) { locoThrottleInput.value = cd.throttle * 100; throttleValueDisplay.textContent = `${Math.round(cd.throttle * 100)}%`; }
    updateReverserButtons(cd.reverser);
    updateCouplingControls(cd);
    slipIndicator.textContent = cd.isSlipping ? '⚠ SLIP' : 'OK';
    slipIndicator.classList.toggle('slipping', cd.isSlipping);
  });
}

let locoControlRefreshIntervalId;
locoIdSelect.addEventListener('change', updateLocoDisplay);
sidebar.on("content", e => {
  clearInterval(locoControlRefreshIntervalId);
  if (e.id == "locoControlTab") locoControlRefreshIntervalId = setInterval(updateLocoDisplay, 1000 / 9);
});
sidebar.on("closing", () => { clearInterval(locoControlRefreshIntervalId); locoControlRefreshIntervalId = undefined; });

function sendLocoCommand(cmd) {
  const guid = getControlledLocoGuid();
  if (guid) fetch(new URL(`/car/${guid}/control?${cmd}`, location), { method: 'POST' });
}
function rangeCommandSender(param) { return e => sendLocoCommand(`${param}=${e.target.value / 100}`); }

locoTrainBrakeInput.addEventListener('input', e => { rangeCommandSender('trainBrake')(e); trainBrakeValueDisplay.textContent = `${e.target.value}%`; });
locoIndependentBrakeInput.addEventListener('input', e => { rangeCommandSender('independentBrake')(e); indepBrakeValueDisplay.textContent = `${e.target.value}%`; });
document.getElementById('locoControlReverserReverseButton').addEventListener('click', () =>
  sendLocoCommand(`reverser=${isReverserButtonActive(reverseButton) ? 0.5 : 0}`));
document.getElementById('locoControlReverserForwardButton').addEventListener('click', () =>
  sendLocoCommand(`reverser=${isReverserButtonActive(forwardButton) ? 0.5 : 1}`));
locoThrottleInput.addEventListener('input', e => { rangeCommandSender('throttle')(e); throttleValueDisplay.textContent = `${e.target.value}%`; });
locoControlCoupleButton.addEventListener('click', () => sendLocoCommand('couple=0'));
locoControlUncoupleButton.addEventListener('click', () => sendLocoCommand(`uncouple=${locoControlUncoupleSelect.value}`));

locoTrainBrakeInput.addEventListener("pointerdown", () => locoTrainBrakeEditing = true);
locoTrainBrakeInput.addEventListener("pointerup", () => { locoTrainBrakeEditing = false; updateLocoDisplay(); });
locoTrainBrakeInput.addEventListener("pointercancel", () => locoTrainBrakeEditing = false);
locoIndependentBrakeInput.addEventListener("pointerdown", () => locoIndependentBrakeEditing = true);
locoIndependentBrakeInput.addEventListener("pointerup", () => { locoIndependentBrakeEditing = false; updateLocoDisplay(); });
locoIndependentBrakeInput.addEventListener("pointercancel", () => locoIndependentBrakeEditing = false);
locoThrottleInput.addEventListener("pointerdown", () => locoThrottleEditing = true);
locoThrottleInput.addEventListener("pointerup", () => { locoThrottleEditing = false; updateLocoDisplay(); });
locoThrottleInput.addEventListener("pointercancel", () => locoThrottleEditing = false);

/////////////////////
// cars

const carWidthMeters = 3, carWidthPx = 20, svgPixelsPerMeter = carWidthPx / 3;
const allCarData = new Map();
const carMarkers = new Map();

function getCarColor(carId) {
  const jobId = carJobIds.get(carId);
  switch (getCarColorMode()) {
    case 'jobId': return jobId ? colorByHashing(jobId) : 'gray';
    case 'jobType': return jobId ? colorForJobType(jobId) : 'gray';
    case 'destination': return jobId ? colorForJobDestination(jobId) : 'gray';
    case 'carType': return colorByHashing(carId.slice(0,3));
  }
}

function updateCarColor(carId) {
  const m = carMarkers.get(carId);
  const rect = m?.getElement()?.querySelector('rect');
  if (rect) rect.setAttribute('fill', getCarColor(carId));
}

function updateAllCarColors() { carMarkers.forEach((_, id) => updateCarColor(id)); }

const locoShapeNoseDepth = 10;

function createCarShape(carId, carData) {
  const isLoco = carId.startsWith('L-');
  const lp = carData.length * svgPixelsPerMeter;
  return isLoco
    ? `<polygon points="${-lp/2},-${carWidthPx/2} ${-lp/2},${carWidthPx/2} ${lp/2-locoShapeNoseDepth},${carWidthPx/2} ${lp/2},0 ${lp/2-locoShapeNoseDepth},-${carWidthPx/2}" fill="goldenrod" fill-opacity="70%" stroke="black" stroke-width="1%"/>`
    : `<rect x="${-lp/2}" y="-10" width="${lp}" height="20" fill-opacity="70%" stroke="black" stroke-width="1%"/>`;
}

function createCarLabel(carId, carData) {
  const isLoco = carId.startsWith('L-');
  const jobId = carJobIds.get(carId);
  const lp = carData.length * svgPixelsPerMeter;
  const rot = carData.rotation >= 180 ? 'rotate(180)' : '';
  if (isLoco) return `<text transform="translate(-3 0) ${rot}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="bold">${carId}</text>`;
  const jl = !jobId ? "" : jobId.split('-').length == 3 ? jobId.slice(-5,-3) + jobId.slice(-2) : jobId.split('-').join('');
  return `<text x="${-lp/2+5}" transform="${rot}" dominant-baseline="central" font-size="16">${jl}</text>` +
    `<text y="-0.5em" transform="${rot} translate(${lp/2-5})" dominant-baseline="central" text-anchor="end" font-size="8" font-family="monospace" font-weight="bold"><tspan x="0">${carId.slice(0,-3).replaceAll('-','')}</tspan><tspan x="0" dy="1em">${carId.slice(-3)}</tspan></text>`;
}

function createCarOverlay(carId, carData) {
  const lp = carData.length * svgPixelsPerMeter;
  const m = Math.sqrt(lp/2*lp/2 + carWidthPx/2*carWidthPx/2);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', carId);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', `${-m} ${-carWidthPx/2} ${m*2} ${carWidthPx}`);
  return svg;
}

function updateCarMarker(carId) {
  const marker = carMarkers.get(carId);
  if (!marker) return;
  const cd = allCarData.get(carId);
  marker.setBounds(getCarOverlayBounds(cd));
  marker.setRotationAngle(cd.rotation - 90);
  marker.getElement().innerHTML = createCarShape(carId, cd) + createCarLabel(carId, cd);
  updateCarColor(carId);
}

function getCarOverlayBounds(cd) {
  const p = cd.position, l = metersToDegrees * cd.length, w = metersToDegrees * carWidthMeters;
  return [[p[0]-w/2, p[1]-l/2], [p[0]+w/2, p[1]+l/2]];
}

function createNewCar(carId, carData) {
  allCarData.set(carId, carData);
  createCarRow(carId);
  const overlay = L.svgOverlay(createCarOverlay(carId, carData), getCarOverlayBounds(carData),
    { interactive: true, bubblingMouseEvents: false })
    .addEventListener('mouseup', () => followCar(carId, true)).addTo(map);
  carMarkers.set(carId, overlay);
  updateCarMarker(carId);
}

function updateCar(carId, carData) { allCarData.set(carId, carData); updateCarRow(carId); updateCarMarker(carId); }

function removeCar(carId) {
  removeCarRow(carId);
  const m = carMarkers.get(carId);
  if (m) { m.remove(); carMarkers.delete(carId); }
  allCarData.delete(carId);
}

function updateAllCars(data) {
  Object.entries(data).forEach(([id, cd]) => { carMarkers.has(id) ? updateCar(id, cd) : createNewCar(id, cd); });
  for (const [id] of carMarkers) if (!data[id]) removeCar(id);
  updateLocoList(); updateCarStats(); filterCarList();
}

function updateCars(cars) { Object.entries(cars).forEach(([id, cd]) => updateCar(id, cd)); }

/////////////////////
// events

function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}
const sessionId = uuidv4();
const updateInterval = 100;
let updateStart;

function updateOnce() {
  updateStart = performance.now();
  return fetch(new URL(`/updates/${sessionId}`, location))
  .then(resp => { setConnectionStatus(true); return resp.json(); })
  .then(updateData => {
    Object.entries(updateData).forEach(([tag, data]) => {
      switch (tag) {
        case 'cars': updateAllCars(data); break;
        case 'jobs': updateAllJobs(data); break;
        case 'junctions': updateAllJunctions(data); break;
        case 'player': updatePlayerOverlays(data); break;
        default:
          const seg = tag.split('-');
          if (seg[0] === 'trainset') updateCars(data);
          else if (seg[0] === 'carguid') updateCar(data.id, data);
      }
    });
  })
  .then(() => { if (markerToFollow) map.panTo(markerToFollow.getBounds().getCenter()); });
}

function updateLoop() {
  updateOnce()
  .then(() => {
    consecutiveFailures = 0;
    setTimeout(updateLoop, Math.max((updateStart + updateInterval) - performance.now(), 0));
  })
  .catch(() => {
    consecutiveFailures++;
    setConnectionStatus(false);
    setTimeout(updateLoop, Math.min(1000 * Math.pow(2, consecutiveFailures - 1), 10000));
  });
}

junctionsReady.then(() => updateLoop());
