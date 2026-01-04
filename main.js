// Initialize Three.js scene
const canvas = document.getElementById('hero-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
  alpha: true
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 7);

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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

// ============ THEME TOGGLE ============
let isDarkMode = true;
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

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
    themeIcon.textContent = '☾';
    material.blending = THREE.AdditiveBlending;
  } else {
    themeIcon.textContent = '☼';
    material.blending = THREE.NormalBlending;
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
let holdTimer = 0;
let holdDuration = 3.0;
let orbitTimer = 0;
let orbitDuration = 6.0;
let currentPatternIndex = 0;
let isManualControl = false;

const patternIndicator = document.getElementById('pattern-indicator');

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

function updateIndicator(text, isActive = false) {
  patternIndicator.textContent = text;
  if (isActive) {
    patternIndicator.classList.add('active');
  } else {
    patternIndicator.classList.remove('active');
  }
}

updateIndicator('Sphere', true);

function animate() {
  requestAnimationFrame(animate);
  const deltaTime = Math.min(clock.getDelta(), 0.033);

  const positionsArray = geometry.attributes.position.array;

  if (currentState === 'orbiting') {
    orbitTimer += deltaTime;
    updateIndicator('Orbiting...', false);

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

    if (!isManualControl && orbitTimer >= orbitDuration) {
      startMorph();
    }

  } else if (currentState === 'morphing') {
    morphProgress += deltaTime / morphDuration;
    updateIndicator(`Forming ${patterns[currentPatternIndex].name}...`, true);

    if (morphProgress >= 1) {
      morphProgress = 1;
      currentState = 'holding';
      holdTimer = 0;
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
    holdTimer += deltaTime;
    updateIndicator(`${patterns[currentPatternIndex].name}`, true);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      positionsArray[ix] += (targetPositions[ix] - positionsArray[ix]) * 0.02;
      positionsArray[iy] += (targetPositions[iy] - positionsArray[iy]) * 0.02;
      positionsArray[iz] += (targetPositions[iz] - positionsArray[iz]) * 0.02;
    }

    if (!isManualControl && holdTimer >= holdDuration) {
      resetToOrbiting();
    }
  }

  geometry.attributes.position.needsUpdate = true;

  points.rotation.y += deltaTime * 0.04;
  points.rotation.x = Math.sin(clock.elapsedTime * 0.1) * 0.1;

  renderer.render(scene, camera);
}

function startMorph() {
  currentState = 'morphing';
  morphProgress = 0;
  orbitTimer = 0;

  currentPatternIndex = (currentPatternIndex + 1) % patterns.length;

  const newTarget = patterns[currentPatternIndex].fn(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
    targetPositions[i] = newTarget[i];
  }
}

function resetToOrbiting() {
  currentState = 'orbiting';
  morphProgress = 0;
  holdTimer = 0;
  orbitTimer = 0;

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
}

// Handle window resize
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onResize);

// Start animation
animate();

// ============ NAVIGATION HIGHLIGHT ============
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('nav a');

function highlightNav() {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.clientHeight;
    if (window.pageYOffset >= sectionTop - 200) {
      current = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
}

window.addEventListener('scroll', highlightNav);
highlightNav();

// ============ SMOOTH SCROLL ============
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = link.getAttribute('href');
    const targetSection = document.querySelector(targetId);
    targetSection.scrollIntoView({ behavior: 'smooth' });
  });
});

