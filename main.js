// Initialize Three.js scene
const canvas = document.getElementById('hero-canvas');

// WebGL may be unavailable (e.g. hardware acceleration disabled or the GPU is
// blocklisted). Detect that up front so we fall back to the static gradient
// background instead of throwing and taking the rest of the page down with it.
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
} catch (err) {
  console.warn('WebGL unavailable — skipping the point cloud animation.', err);
  document.documentElement.classList.add('no-webgl');
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 7);

// Lighting for subtle depth
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0x6366f1, 0.5);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Particle system setup
const PARTICLE_COUNT = 6000;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const basePositions = new Float32Array(PARTICLE_COUNT * 3);
const targetPositions = new Float32Array(PARTICLE_COUNT * 3);
const colors = new Float32Array(PARTICLE_COUNT * 3);

// Initialize particles in a dynamic sphere
const RADIUS = 5.0;
for (let i = 0; i < PARTICLE_COUNT; i++) {
  const phi = Math.acos(1 - 2 * Math.random());
  const theta = Math.random() * Math.PI * 2;
  const r = RADIUS * Math.cbrt(Math.random());

  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.cos(phi);
  const z = r * Math.sin(phi) * Math.sin(theta);

  positions[i * 3] = basePositions[i * 3] = x;
  positions[i * 3 + 1] = basePositions[i * 3 + 1] = y;
  positions[i * 3 + 2] = basePositions[i * 3 + 2] = z;

  // Gradient colors based on position
  colors[i * 3] = 0.6 + y / RADIUS * 0.4;     // R
  colors[i * 3 + 1] = 0.6 + x / RADIUS * 0.3; // G
  colors[i * 3 + 2] = 0.9;                     // B
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
  size: 0.028,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.85,
  vertexColors: true,
  blending: THREE.AdditiveBlending
});

const points = new THREE.Points(geometry, material);
scene.add(points);

// ============ NODE GRAPH OVERLAY (agentic workflow) ============
// A subset of the particles act as "nodes" with dynamic connections drawn
// between nearby ones, evoking an agentic network over the point cloud.
const NODE_COUNT = 70;
const nodeIndices = new Int32Array(NODE_COUNT);
for (let i = 0; i < NODE_COUNT; i++) {
  nodeIndices[i] = Math.floor((i + 0.5) * PARTICLE_COUNT / NODE_COUNT);
}

// Node hubs: larger, brighter points sampled from the cloud
const nodeGeometry = new THREE.BufferGeometry();
const nodePositions = new Float32Array(NODE_COUNT * 3);
const nodeColors = new Float32Array(NODE_COUNT * 3);
nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
nodeGeometry.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));

const nodeMaterial = new THREE.PointsMaterial({
  size: 0.028,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.95,
  vertexColors: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
scene.add(nodePoints);

// Connections: a pool of line segments, redrawn each frame by proximity
const MAX_LINE_VERTS = NODE_COUNT * NODE_COUNT; // safe upper bound (2 * pairs)
const lineGeometry = new THREE.BufferGeometry();
const linePositions = new Float32Array(MAX_LINE_VERTS * 3);
const lineColors = new Float32Array(MAX_LINE_VERTS * 3);
lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

const lineMaterial = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 1.0,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
scene.add(lineSegments);

// ---- Lightning bolts: pulses that travel through the node graph ----
const MAX_BOLTS = 2;
const BOLT_LENGTH = 15;     // target number of nodes a bolt threads through
const HOP_DIST = 2.0;       // max distance between consecutive nodes
const BOLT_TAIL = 4;        // glowing segments trailing behind the head
const nodeBoost = new Float32Array(NODE_COUNT);

const bolts = [];
let spawnTimer = 0;
let nextSpawn = 1.5;

// Random walk through nearby nodes to form a connected path
function buildBoltPath(startNode) {
  const visited = new Uint8Array(NODE_COUNT);
  let current = startNode === undefined
    ? Math.floor(Math.random() * NODE_COUNT)
    : startNode;
  const path = [current];
  visited[current] = 1;
  const hop2 = HOP_DIST * HOP_DIST;

  while (path.length < BOLT_LENGTH) {
    const cx = nodePositions[current * 3];
    const cy = nodePositions[current * 3 + 1];
    const cz = nodePositions[current * 3 + 2];
    const candidates = [];

    for (let n = 0; n < NODE_COUNT; n++) {
      if (visited[n]) continue;
      const dx = cx - nodePositions[n * 3];
      const dy = cy - nodePositions[n * 3 + 1];
      const dz = cz - nodePositions[n * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < hop2) candidates.push(n);
    }
    if (candidates.length === 0) break;

    current = candidates[Math.floor(Math.random() * candidates.length)];
    path.push(current);
    visited[current] = 1;
  }
  return path;
}

function spawnBolt(startNode, minLen) {
  const path = buildBoltPath(startNode);
  if (path.length < (minLen || 4)) return; // too short to read as a bolt
  bolts.push({
    path: path,
    head: 0,
    speed: 3 + Math.random() * 2 // segments per second (slow lightning)
  });
}

// Click anywhere spawns a bolt from the node nearest the cursor
const clickProjVec = new THREE.Vector3();

function nearestNodeToScreen(clientX, clientY) {
  const nx = (clientX / window.innerWidth) * 2 - 1;
  const ny = -(clientY / window.innerHeight) * 2 + 1;
  nodePoints.updateMatrixWorld(true);

  let best = -1;
  let bestDist = Infinity;
  for (let n = 0; n < NODE_COUNT; n++) {
    clickProjVec.set(nodePositions[n * 3], nodePositions[n * 3 + 1], nodePositions[n * 3 + 2]);
    clickProjVec.applyMatrix4(nodePoints.matrixWorld);
    clickProjVec.project(camera);
    const dx = clickProjVec.x - nx;
    const dy = clickProjVec.y - ny;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

window.addEventListener('click', (event) => {
  const node = nearestNodeToScreen(event.clientX, event.clientY);
  if (node < 0) return;
  if (bolts.length >= MAX_BOLTS) bolts.shift(); // make room — a click always fires
  spawnBolt(node, 2);
});

// Update node positions, advance the bolts, and rebuild the line buffer
function updateGraph(deltaTime, isLight) {
  const posArr = geometry.attributes.position.array;

  for (let n = 0; n < NODE_COUNT; n++) {
    const src = nodeIndices[n] * 3;
    nodePositions[n * 3] = posArr[src];
    nodePositions[n * 3 + 1] = posArr[src + 1];
    nodePositions[n * 3 + 2] = posArr[src + 2];
    nodeBoost[n] = 0;
  }

  // Spawn new bolts at random intervals
  spawnTimer += deltaTime;
  if (spawnTimer >= nextSpawn && bolts.length < MAX_BOLTS) {
    spawnTimer = 0;
    nextSpawn = 3 + Math.random() * 5; // long gaps: usually 0–1 bolts, rarely 2
    spawnBolt();
  }

  let v = 0;

  for (let i = bolts.length - 1; i >= 0; i--) {
    const bolt = bolts[i];
    bolt.head += bolt.speed * deltaTime;
    const segCount = bolt.path.length - 1;

    // Retire once the head has passed the end and the tail has faded
    if (bolt.head > segCount + BOLT_TAIL * 1.5) {
      bolts.splice(i, 1);
      continue;
    }

    for (let s = 0; s < segCount; s++) {
      // Brightest at the head, exponential fade for segments behind it
      let intensity;
      const behind = bolt.head - (s + 1);
      if (behind >= 0) {
        intensity = Math.exp(-behind / BOLT_TAIL);
      } else {
        const lead = bolt.head - s; // head crossing into this segment
        intensity = (lead > 0 && lead < 1) ? lead : 0;
      }
      if (intensity <= 0.03) continue;

      const a = bolt.path[s];
      const b = bolt.path[s + 1];

      linePositions[v * 3] = nodePositions[a * 3];
      linePositions[v * 3 + 1] = nodePositions[a * 3 + 1];
      linePositions[v * 3 + 2] = nodePositions[a * 3 + 2];
      linePositions[(v + 1) * 3] = nodePositions[b * 3];
      linePositions[(v + 1) * 3 + 1] = nodePositions[b * 3 + 1];
      linePositions[(v + 1) * 3 + 2] = nodePositions[b * 3 + 2];

      const t = Math.min(intensity, 1);
      if (t > nodeBoost[a]) nodeBoost[a] = t;
      if (t > nodeBoost[b]) nodeBoost[b] = t;

      let r, g, bl;
      if (isLight) {
        // Normal blending: strong = vivid orange (#ea580c), weak fades to white
        r = 1 - t * 0.08;
        g = 1 - t * 0.66;
        bl = 1 - t * 0.95;
      } else {
        // Additive blending: orange (#ff7a1a) with a white-hot core at the head
        const white = Math.max(0, t - 0.6) * 1.2;
        r = 1.0 * t + white;
        g = 0.48 * t + white;
        bl = 0.1 * t + white;
      }

      lineColors[v * 3] = r;
      lineColors[v * 3 + 1] = g;
      lineColors[v * 3 + 2] = bl;
      lineColors[(v + 1) * 3] = r;
      lineColors[(v + 1) * 3 + 1] = g;
      lineColors[(v + 1) * 3 + 2] = bl;

      v += 2;
      if (v >= MAX_LINE_VERTS) break;
    }
    if (v >= MAX_LINE_VERTS) break;
  }

  lineGeometry.setDrawRange(0, v);
  lineGeometry.attributes.position.needsUpdate = true;
  lineGeometry.attributes.color.needsUpdate = true;

  // Node hubs: dim by default, lit up where a bolt is passing through
  for (let n = 0; n < NODE_COUNT; n++) {
    const boost = nodeBoost[n];
    if (isLight) {
      // dim neutral → vivid orange (#ea580c)
      nodeColors[n * 3] = 0.45 + boost * 0.47;
      nodeColors[n * 3 + 1] = 0.45 - boost * 0.11;
      nodeColors[n * 3 + 2] = 0.5 - boost * 0.45;
    } else {
      // dim neutral → warm orange (#ff7a1a) glow
      nodeColors[n * 3] = 0.3 + boost * 0.85;
      nodeColors[n * 3 + 1] = 0.32 + boost * 0.5;
      nodeColors[n * 3 + 2] = 0.38 + boost * 0.12;
    }
  }
  nodeGeometry.attributes.position.needsUpdate = true;
  nodeGeometry.attributes.color.needsUpdate = true;
}

// ============ THEME TOGGLE ============
const currentHour = new Date().getHours();
const isWorkHours = currentHour >= 8 && currentHour < 18;
let isDarkMode = !isWorkHours;

const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

// Icon paths
const moonIcon = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
const sunIcon = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.93 4.93l1.41 1.41"></path><path d="M17.66 17.66l1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M6.34 17.66l-1.41 1.41"></path><path d="M19.07 4.93l-1.41 1.41"></path>';

// Set initial theme
if (!isDarkMode) {
  document.body.classList.add('light-mode');
  themeIcon.innerHTML = sunIcon;
  material.blending = THREE.NormalBlending;
  nodeMaterial.blending = THREE.NormalBlending;
  lineMaterial.blending = THREE.NormalBlending;
} else {
  themeIcon.innerHTML = moonIcon;
  material.blending = THREE.AdditiveBlending;
  nodeMaterial.blending = THREE.AdditiveBlending;
  lineMaterial.blending = THREE.AdditiveBlending;
}
updateParticleColors(!isDarkMode);

function updateParticleColors(isLight) {
  const colorsArray = geometry.attributes.color.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const y = positions[i * 3 + 1];
    const x = positions[i * 3];

    if (isLight) {
      // Light mode: darker particles
      colorsArray[i * 3] = 0.2 + y / RADIUS * 0.2;
      colorsArray[i * 3 + 1] = 0.25 + x / RADIUS * 0.15;
      colorsArray[i * 3 + 2] = 0.4;
    } else {
      // Dark mode: brighter particles
      colorsArray[i * 3] = 0.6 + y / RADIUS * 0.4;
      colorsArray[i * 3 + 1] = 0.6 + x / RADIUS * 0.3;
      colorsArray[i * 3 + 2] = 0.9;
    }
  }
  geometry.attributes.color.needsUpdate = true;
}

themeToggle.addEventListener('click', () => {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('light-mode');

  if (isDarkMode) {
    themeIcon.innerHTML = moonIcon;
    material.blending = THREE.AdditiveBlending;
    nodeMaterial.blending = THREE.AdditiveBlending;
    lineMaterial.blending = THREE.AdditiveBlending;
  } else {
    themeIcon.innerHTML = sunIcon;
    material.blending = THREE.NormalBlending;
    nodeMaterial.blending = THREE.NormalBlending;
    lineMaterial.blending = THREE.NormalBlending;
  }

  updateParticleColors(!isDarkMode);
});

// ============ PATTERN GENERATORS ============

function createDatabasePattern(count) {
  const positions = new Float32Array(count * 3);
  const stacks = 6;
  const radius = 2.3;
  const height = 3.8;
  const diskThickness = 0.08;

  for (let i = 0; i < count; i++) {
    const layer = Math.floor(Math.random() * stacks);
    const y = (layer / (stacks - 1) - 0.5) * height;
    const angle = Math.random() * Math.PI * 2;

    const rand = Math.random();
    const r = radius * (0.75 + rand * 0.25);

    const yOffset = (Math.random() - 0.5) * diskThickness;

    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = y + yOffset;
    positions[i * 3 + 2] = Math.sin(angle) * r;
  }

  return positions;
}

function createSpherePattern(count) {
  const positions = new Float32Array(count * 3);
  const radius = 3.2;

  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - 2 * Math.random());
    const theta = Math.random() * Math.PI * 2;

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }

  return positions;
}

// Pattern sequence
const patterns = [
  { fn: createSpherePattern, name: "Sphere" },
  { fn: createDatabasePattern, name: "Database" }
];

let currentState = 'holding';
let morphProgress = 0;
let morphDuration = 2.5;
let orbitTimer = 0;
let currentPatternIndex = 0;
let targetPattern = 'sphere';
let shouldOrbit = false;

// Set initial target to sphere pattern
let currentTarget = patterns[currentPatternIndex].fn(PARTICLE_COUNT);
for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
  targetPositions[i] = currentTarget[i];
  positions[i] = currentTarget[i];
  basePositions[i] = currentTarget[i];
}
geometry.attributes.position.needsUpdate = true;

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const deltaTime = Math.min(clock.getDelta(), 0.033);

  const positionsArray = geometry.attributes.position.array;

  if (shouldOrbit) {
    orbitTimer += deltaTime;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      const bx = basePositions[ix];
      const by = basePositions[iy];
      const bz = basePositions[iz];

      const time = orbitTimer;
      const angle1 = time * 0.2 + i * 0.001;
      const angle2 = time * 0.12 + i * 0.0012;
      const angle3 = time * 0.3 - i * 0.0008;

      const radius = Math.sqrt(bx * bx + bz * bz);
      const radiusY = Math.sqrt(bx * bx + by * by);

      const nx = Math.cos(angle1) * radius - Math.sin(angle3) * bz * 0.15;
      const nz = Math.sin(angle1) * radius + Math.cos(angle3) * bx * 0.15;
      const ny = by * Math.cos(angle2) + Math.sin(angle2 * 1.3) * radiusY * 0.08;

      const wave = Math.sin(angle1 * 2.5 + i * 0.015) * 0.12;
      const turbulence = Math.cos(angle3 * 1.7 + i * 0.02) * 0.08;

      positionsArray[ix] += (nx - positionsArray[ix]) * 0.008;
      positionsArray[iy] += (ny + wave - positionsArray[iy]) * 0.008;
      positionsArray[iz] += (nz + turbulence - positionsArray[iz]) * 0.008;
    }
  } else if (currentState === 'morphing') {
    morphProgress += deltaTime / morphDuration;

    if (morphProgress >= 1) {
      morphProgress = 1;
      currentState = 'holding';
    }

    const easeProgress = morphProgress < 0.5
      ? 2 * morphProgress * morphProgress
      : 1 - Math.pow(-2 * morphProgress + 2, 2) / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      const speed = 0.03 + easeProgress * 0.03;
      positionsArray[ix] += (targetPositions[ix] - positionsArray[ix]) * speed;
      positionsArray[iy] += (targetPositions[iy] - positionsArray[iy]) * speed;
      positionsArray[iz] += (targetPositions[iz] - positionsArray[iz]) * speed;
    }
  } else if (currentState === 'holding') {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      positionsArray[ix] += (targetPositions[ix] - positionsArray[ix]) * 0.02;
      positionsArray[iy] += (targetPositions[iy] - positionsArray[iy]) * 0.02;
      positionsArray[iz] += (targetPositions[iz] - positionsArray[iz]) * 0.02;
    }
  }

  geometry.attributes.position.needsUpdate = true;

  updateGraph(deltaTime, !isDarkMode);

  points.rotation.y += deltaTime * 0.04;
  points.rotation.x = Math.sin(clock.elapsedTime * 0.1) * 0.1;

  // Keep the node graph locked to the cloud's orientation
  nodePoints.rotation.copy(points.rotation);
  lineSegments.rotation.copy(points.rotation);

  renderer.render(scene, camera);
}

function switchToPattern(patternName) {
  if (patternName === 'orbit') {
    shouldOrbit = true;
    currentState = 'holding';

    // Set random orbit base positions
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const phi = Math.acos(1 - 2 * Math.random());
      const theta = Math.random() * Math.PI * 2;
      const r = RADIUS * Math.cbrt(Math.random());

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;
    }
    return;
  }

  shouldOrbit = false;

  const patternIndex = patternName === 'sphere' ? 0 : 1;

  if (currentPatternIndex !== patternIndex || currentState === 'orbiting') {
    currentPatternIndex = patternIndex;
    const newTarget = patterns[currentPatternIndex].fn(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
      targetPositions[i] = newTarget[i];
    }

    currentState = 'morphing';
    morphProgress = 0;
  }
}

let lastPattern = 'sphere';
let isThrottled = false;

function updatePatternBasedOnScroll() {
  if (isThrottled) return;

  const scrollY = window.pageYOffset;
  const heroSection = document.getElementById('hero');
  const servicesSection = document.getElementById('services');
  const contactSection = document.getElementById('contact');

  const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
  const servicesTop = servicesSection.offsetTop;
  const servicesBottom = servicesSection.offsetTop + servicesSection.offsetHeight;
  const contactTop = contactSection.offsetTop;

  let newPattern;
  if (scrollY < 100) {
    newPattern = 'sphere';
  } else if (scrollY >= 100 && scrollY < servicesTop - 400) {
    newPattern = 'orbit';
  } else if (scrollY >= servicesTop - 400 && scrollY < servicesBottom - 50) {
    newPattern = 'database';
  } else {
    newPattern = 'orbit';
  }

  if (newPattern !== lastPattern) {
    switchToPattern(newPattern);
    lastPattern = newPattern;

    isThrottled = true;
    setTimeout(() => {
      isThrottled = false;
    }, 150);
  }
}

// Handle window resize
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start the 3D animation and its scroll/resize wiring only when WebGL works.
// Without it, the static gradient background remains and the rest of the page
// (theme toggle, scroll reveals, etc.) still runs normally below.
if (renderer) {
  window.addEventListener('resize', onResize);

  // Start animation
  animate();

  // ============ SCROLL PATTERN UPDATE ============
  window.addEventListener('scroll', updatePatternBasedOnScroll);
  updatePatternBasedOnScroll();
}

// ============ SCROLL INDICATOR FADE ============
const scrollIndicator = document.querySelector('.scroll-indicator');
let hasScrolled = false;

window.addEventListener('scroll', () => {
  if (!hasScrolled && window.pageYOffset > 50) {
    hasScrolled = true;
    scrollIndicator.classList.add('hidden');
  }
});

// ============ SCROLL REVEAL ============
document.body.classList.add('reveal-ready');

const revealEls = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

  revealEls.forEach((el) => revealObserver.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-visible'));
}

