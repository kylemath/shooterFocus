// main.js
// Enhanced 3D urban parkour + paintball prototype with mouse look, splatters, stairs, bridges, and textures

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";

// ----- Basic setup -----
const canvas = document.getElementById("gameCanvas");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky-ish blue
scene.fog = new THREE.Fog(0xaaccee, 20, 100);

const camera = new THREE.PerspectiveCamera(
  45, // Start in focused mode
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// ----- Lights -----
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(20, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 200;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

// ----- Ground -----
const groundGeo = new THREE.PlaneGeometry(200, 200, 20, 20);
const groundMat = new THREE.MeshStandardMaterial({ 
  color: 0x444444,
  roughness: 0.8,
  metalness: 0.1
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ----- Texture and Shader Utilities -----
function createBuildingTexture(width = 256, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Base color
  const hue = Math.random() * 360;
  const sat = 20 + Math.random() * 30;
  const light = 30 + Math.random() * 20;
  ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
  ctx.fillRect(0, 0, width, height);
  
  // Add window pattern
  const windowRows = 4 + Math.floor(Math.random() * 6);
  const windowCols = 3 + Math.floor(Math.random() * 4);
  const windowW = width / (windowCols * 2 + 1);
  const windowH = height / (windowRows * 2 + 1);
  
  ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light + 20}%)`;
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowCols; col++) {
      const x = windowW * (col * 2 + 1);
      const y = windowH * (row * 2 + 1);
      const w = windowW * 0.7;
      const h = windowH * 0.7;
      
      // Some windows lit
      if (Math.random() > 0.3) {
        ctx.fillStyle = `hsl(${hue + 30}, ${sat + 20}%, ${light + 40}%)`;
      } else {
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light - 10}%)`;
      }
      ctx.fillRect(x, y, w, h);
    }
  }
  
  // Add some noise/texture
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 10;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

// ----- Building System -----
const buildings = [];
const buildingMeshes = [];

function addBuilding(x, z, w, d, h) {
  const geo = new THREE.BoxGeometry(w, h, d);
  
  // Create textured material
  const texture = createBuildingTexture();
  const mat = new THREE.MeshStandardMaterial({ 
    map: texture,
    roughness: 0.7,
    metalness: 0.1
  });
  
  const mesh = new THREE.Mesh(geo, mat);
  // Ensure building sits on ground (y = 0)
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  
  const buildingData = {
    mesh,
    x, z, w, d, h,
    position: new THREE.Vector3(x, h / 2, z)
  };
  
  buildings.push(buildingData);
  buildingMeshes.push(mesh);
  return buildingData;
}

// Generate buildings in a more organized way
for (let i = 0; i < 15; i++) {
  const x = (Math.random() - 0.5) * 80;
  const z = (Math.random() - 0.5) * 80;
  const w = 4 + Math.random() * 8;
  const d = 4 + Math.random() * 8;
  const h = 6 + Math.random() * 18;
  addBuilding(x, z, w, d, h);
}

// ----- Stairs System -----
function addStairs(startX, startZ, endX, endZ, startHeight, endHeight, width = 2) {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const dh = endHeight - startHeight;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const steps = Math.max(3, Math.floor(distance / 1.5));
  const stepHeight = dh / steps;
  const stepLength = distance / steps;
  
  const dirX = dx / distance;
  const dirZ = dz / distance;
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + dx * t;
    const z = startZ + dz * t;
    const y = startHeight + dh * t;
    
    const stepGeo = new THREE.BoxGeometry(stepLength * 1.1, 0.3, width);
    const stepMat = new THREE.MeshStandardMaterial({ 
      color: 0x666666,
      roughness: 0.6,
      metalness: 0.1
    });
    const step = new THREE.Mesh(stepGeo, stepMat);
    step.position.set(x, y + 0.15, z);
    step.castShadow = true;
    step.receiveShadow = true;
    scene.add(step);
    buildingMeshes.push(step); // Allow splatters on stairs
  }
}

// Add stairs between some buildings
for (let i = 0; i < buildings.length - 1; i += 2) {
  const b1 = buildings[i];
  const b2 = buildings[i + 1];
  if (b1 && b2) {
    const startHeight = b1.h;
    const endHeight = b2.h;
    addStairs(b1.x, b1.z, b2.x, b2.z, startHeight, endHeight, 2);
  }
}

// ----- Bridges System -----
function addSimpleBridge(b1, b2) {
  const center1 = new THREE.Vector3(b1.x, Math.max(b1.h, b2.h) - 1, b1.z);
  const center2 = new THREE.Vector3(b2.x, Math.max(b1.h, b2.h) - 1, b2.z);
  const dist = center1.distanceTo(center2);
  
  const geometry = new THREE.BoxGeometry(1, 0.2, dist);
  const material = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const bridge = new THREE.Mesh(geometry, material);
  
  // Position at midpoint
  bridge.position.copy(center1).add(center2).multiplyScalar(0.5);
  bridge.lookAt(center2);
  
  bridge.castShadow = true;
  bridge.receiveShadow = true;
  scene.add(bridge);
  buildingMeshes.push(bridge); // Add to collision list
}

// Connect buildings with bridges
for (let i = 0; i < buildings.length - 1; i += 3) {
  const b1 = buildings[i];
  const b2 = buildings[i + 1];
  if (b1 && b2) {
    addSimpleBridge(b1, b2);
  }
}

// ----- Player -----
const playerRadius = 0.4;
const playerHeight = 1.7;

// Fallback capsule if model fails or while loading
let playerMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(playerRadius, playerHeight - 2 * playerRadius, 8, 16),
  new THREE.MeshStandardMaterial({ color: 0x3333ff })
);
playerMesh.castShadow = true;
playerMesh.position.set(0, playerHeight / 2, 0);
scene.add(playerMesh);

const player = {
  mesh: playerMesh,
  velocity: new THREE.Vector3(0, 0, 0),
  onGround: false,
  yaw: 0, // horizontal rotation
  pitch: 0 // vertical rotation (for camera)
};

// Load Human Model
let mixer = null;
const gltfLoader = new GLTFLoader();
const modelUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/Soldier.glb';
let rightHandBone = null;

// Create Gun Model (Procedural)
function createGun() {
    const gunGroup = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.BoxGeometry(0.1, 0.15, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, 0.1);
    gunGroup.add(body);
    
    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, 0.35);
    gunGroup.add(barrel);
    
    // Handle
    const handleGeo = new THREE.BoxGeometry(0.08, 0.2, 0.08);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.rotation.x = -0.2;
    handle.position.set(0, -0.1, 0);
    gunGroup.add(handle);

    // Hopper
    const hopperGeo = new THREE.BoxGeometry(0.12, 0.15, 0.2);
    const hopperMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const hopper = new THREE.Mesh(hopperGeo, hopperMat);
    hopper.position.set(0, 0.15, 0.1);
    gunGroup.add(hopper);
    
    // Add a bright red tip for visibility
    const tipGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(0, 0.05, 0.6);
    gunGroup.add(tip);
    
    return gunGroup;
}

gltfLoader.load(
  modelUrl,
  (gltf) => {
    scene.remove(playerMesh); // Remove capsule
    
    const model = gltf.scene;
    model.scale.set(1, 1, 1);
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      // Find right hand bone
      if (obj.isBone && (obj.name === 'mixamorigRightHand' || obj.name === 'RightHand' || obj.name === 'Hand.R')) {
          rightHandBone = obj;
          console.log("Found right hand bone:", obj.name);
      }
    });
    
    // Attach Gun
    const gun = createGun();
    
    // Debug bones
    model.traverse((o) => {
        if (o.isBone) {
            // console.log(o.name); // Uncomment to debug bone names
        }
    });

    if (rightHandBone) {
        // Adjust gun position relative to hand
        gun.position.set(0, -0.2, 0.2); // Adjusted for better grip
        gun.rotation.set(0, -Math.PI / 2, Math.PI/2); 
        gun.scale.set(5, 5, 5); // Massive scale to ensure visibility
        rightHandBone.add(gun);
        player.gun = gun; // Store reference for animation
    } else {
        console.warn("Right hand bone not found, attaching to model root");
        gun.position.set(0.3, 1.2, 0.5);
        gun.scale.set(5, 5, 5);
        model.add(gun);
        player.gun = gun;
    }

    playerMesh = model;
    player.mesh = playerMesh;
    scene.add(playerMesh);
    
    // Setup animation
    mixer = new THREE.AnimationMixer(model);
    const idleClip = gltf.animations[0]; 
    const runClip = gltf.animations[1]; 
    const walkClip = gltf.animations[3]; 

    if (idleClip) {
        const action = mixer.clipAction(idleClip);
        action.play();
    }
    
    player.mixer = mixer;
    player.animations = {
        idle: idleClip ? mixer.clipAction(idleClip) : null,
        run: runClip ? mixer.clipAction(runClip) : null,
        walk: walkClip ? mixer.clipAction(walkClip) : null
    };
    
    console.log("Player model loaded");
  },
  undefined,
  (err) => {
      console.error("Error loading player model:", err);
  }
);

// ----- Mouse Look (Pointer Lock) -----
let isPointerLocked = false;
let mouseDeltaX = 0;
let mouseDeltaY = 0;

canvas.addEventListener('click', () => {
  canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', (e) => {
  if (isPointerLocked) {
    mouseDeltaX += e.movementX;
    mouseDeltaY += e.movementY;
  }
});

// ----- Input handling -----
const keys = {};

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Escape") {
    document.exitPointerLock();
  }
  if (e.code === "Tab") {
    e.preventDefault();
    toggleFocusMode();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// Prevent context menu
window.addEventListener("contextmenu", (e) => e.preventDefault());

// ----- Floating Targets System -----
const targets = [];
const MAX_TARGETS = 30;

function createTarget() {
  // Create a circular target with rings
  const targetGroup = new THREE.Group();
  
  // Outer ring (red)
  const outerGeo = new THREE.CircleGeometry(0.8, 32);
  const outerMat = new THREE.MeshStandardMaterial({ 
    color: 0xff3333, 
    side: THREE.DoubleSide,
    emissive: 0xff0000,
    emissiveIntensity: 0.4
  });
  const outer = new THREE.Mesh(outerGeo, outerMat);
  targetGroup.add(outer);
  
  // Middle ring (white)
  const middleGeo = new THREE.CircleGeometry(0.5, 32);
  const middleMat = new THREE.MeshStandardMaterial({ 
    color: 0xffffff, 
    side: THREE.DoubleSide,
    emissive: 0xffffff,
    emissiveIntensity: 0.2
  });
  const middle = new THREE.Mesh(middleGeo, middleMat);
  middle.position.z = 0.01;
  targetGroup.add(middle);
  
  // Bullseye (red)
  const bullseyeGeo = new THREE.CircleGeometry(0.2, 32);
  const bullseyeMat = new THREE.MeshStandardMaterial({ 
    color: 0xff0000, 
    side: THREE.DoubleSide,
    emissive: 0xff0000,
    emissiveIntensity: 0.6
  });
  const bullseye = new THREE.Mesh(bullseyeGeo, bullseyeMat);
  bullseye.position.z = 0.02;
  targetGroup.add(bullseye);
  
  // Store materials for pulsing effect
  targetGroup.userData.materials = [outerMat, middleMat, bullseyeMat];
  
  // Random position in the air
  const angle = Math.random() * Math.PI * 2;
  const distance = 10 + Math.random() * 30;
  const x = Math.cos(angle) * distance;
  const z = Math.sin(angle) * distance;
  const y = 3 + Math.random() * 15;
  
  targetGroup.position.set(x, y, z);
  
  // Random drift velocity
  const driftVelocity = new THREE.Vector3(
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 1,
    (Math.random() - 0.5) * 2
  );
  
  scene.add(targetGroup);
  
  return {
    mesh: targetGroup,
    velocity: driftVelocity,
    hitRadius: 0.8,
    score: 10,
    oscillation: Math.random() * Math.PI * 2
  };
}

// Spawn initial targets
for (let i = 0; i < MAX_TARGETS; i++) {
  targets.push(createTarget());
}

// Explosion effect when target is hit
function createExplosion(position, color) {
  const particleCount = 20;
  for (let i = 0; i < particleCount; i++) {
    const particleGeo = new THREE.SphereGeometry(0.1, 4, 4);
    const particleMat = new THREE.MeshBasicMaterial({ color });
    const particle = new THREE.Mesh(particleGeo, particleMat);
    
    particle.position.copy(position);
    scene.add(particle);
    
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );
    
    paintballs.push({
      mesh: particle,
      velocity: velocity,
      color: color.clone(),
      life: 0.5
    });
  }
}

// ----- Paintball and Splatter System -----
const paintballs = [];
const splatters = [];
const raycaster = new THREE.Raycaster();
let score = 0;

// ----- Focus Mode System -----
let focusMode = 'focused'; // 'focused' or 'broad'
const focusModes = {
  focused: {
    fov: 45,
    fogDensity: 0.01,
    vignette: 'focused',
    label: 'FOCUSED'
  },
  broad: {
    fov: 90,
    fogDensity: 0.03,
    vignette: 'broad',
    label: 'BROAD'
  }
};

function updateScoreDisplay() {
  const scoreEl = document.getElementById('score');
  if (scoreEl) scoreEl.textContent = `Score: ${score}`;
}

function showHitFeedback() {
  const crosshair = document.getElementById('crosshair');
  if (crosshair) {
    crosshair.classList.add('hit');
    setTimeout(() => {
      crosshair.classList.remove('hit');
    }, 100);
  }
}

function toggleFocusMode() {
  focusMode = focusMode === 'focused' ? 'broad' : 'focused';
  const mode = focusModes[focusMode];
  
  // Update UI
  const focusModeEl = document.getElementById('focusMode');
  if (focusModeEl) focusModeEl.textContent = mode.label;
  
  // Update vignette
  const vignetteEl = document.getElementById('vignette');
  if (vignetteEl) {
    vignetteEl.className = mode.vignette;
  }
  
  // Animate FOV change
  animateFOV(mode.fov);
  
  // Update fog (more fog in broad mode for cloudiness)
  scene.fog.near = focusMode === 'focused' ? 20 : 10;
  scene.fog.far = focusMode === 'focused' ? 100 : 60;
  
  // Adjust rendering quality for blur effect in broad mode
  const pixelRatio = focusMode === 'focused' 
    ? window.devicePixelRatio 
    : window.devicePixelRatio * 0.7;
  renderer.setPixelRatio(pixelRatio);
}

function animateFOV(targetFOV) {
  const startFOV = camera.fov;
  const duration = 1000; // ms
  const startTime = Date.now();
  
  function updateFOV() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Smooth easing
    const eased = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    camera.fov = startFOV + (targetFOV - startFOV) * eased;
    camera.updateProjectionMatrix();
    
    if (progress < 1) {
      requestAnimationFrame(updateFOV);
    }
  }
  
  updateFOV();
}

// Pre-load splatter texture
const splatterTextureLoader = new THREE.TextureLoader();
// Using a procedural approach for texture to ensure no CORS issues, or data URI
function createSplatterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // ... (drawing code inside createSplatter function mostly)
  // Let's return the canvas directly
  return canvas; 
}

function createSplatter(position, normal, color, size = 1.5) {
  const orient = new THREE.Euler();
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  orient.setFromQuaternion(quat);

  const decalGeo = new DecalGeometry(
      new THREE.Mesh(new THREE.BoxGeometry(1,1,1)), // Placeholder, DecalGeometry needs a mesh to project on? 
      // Wait, DecalGeometry constructor takes (mesh, position, orientation, size)
      // We need to find WHICH mesh we hit to project correctly on it.
      // We'll pass the hit object from raycast result.
      // See usage below.
  );
}

// Improved Splatter function that takes the hit object
function addDecal(hit, color) {
    const size = 1.0 + Math.random() * 1.5;
    const position = hit.point.clone();
    const orientation = new THREE.Euler();
    
    // Calculate orientation
    const mouseHelper = new THREE.Object3D();
    mouseHelper.position.copy(position);
    mouseHelper.lookAt(position.clone().add(hit.face.normal));
    orientation.copy(mouseHelper.rotation);
    orientation.z = Math.random() * 2 * Math.PI;

    const scale = new THREE.Vector3(size, size, size); // box size for projection?
    // DecalGeometry( mesh, position, orientation, sizeVector )
    
    const decalGeo = new DecalGeometry(hit.object, position, orientation, scale);

    // Create procedural texture per splatter color
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgba(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)}, 0.9)`;
    
    // Random blob
    ctx.beginPath();
    ctx.arc(32, 32, 15 + Math.random() * 10, 0, Math.PI * 2);
    ctx.fill();
    for(let i=0; i<8; i++) {
        const r = 2 + Math.random() * 5;
        const a = Math.random() * Math.PI * 2;
        const d = 15 + Math.random() * 15;
        ctx.beginPath();
        ctx.arc(32 + Math.cos(a)*d, 32 + Math.sin(a)*d, r, 0, Math.PI*2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    
    const decalMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        side: THREE.DoubleSide
    });

    const m = new THREE.Mesh(decalGeo, decalMat);
    scene.add(m);
    splatters.push(m);

    // Limit splatters
    if (splatters.length > 200) {
        const old = splatters.shift();
        scene.remove(old);
        old.geometry.dispose();
        old.material.dispose();
    }
}

window.addEventListener("mousedown", (e) => {
  // Left click shoots paintball (only when pointer locked)
  if (e.button === 0 && isPointerLocked) {
    shootPaintball();
  }
});

function shootPaintball() {
  const color = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);
  const ballGeo = new THREE.SphereGeometry(0.15, 8, 8);
  const ballMat = new THREE.MeshStandardMaterial({ color });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;

  // Use camera direction for shooting
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.normalize();

  // Start from player position + offset for "gun"
  const start = player.mesh.position.clone().add(new THREE.Vector3(0, playerHeight * 0.7, 0));
  // Offset slightly right to match gun hand if possible, or just center
  const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize(); // Actually this is left? No cross(up, dir) depends. 
  // standard: forward x up = right? No. 
  // Let's just use simple offset based on yaw
  const gunOffset = new THREE.Vector3(
      Math.sin(player.yaw - 0.5), 0, Math.cos(player.yaw - 0.5)
  ).multiplyScalar(0.5);
  
  // Just use camera center for gameplay feel
  start.add(dir.clone().multiplyScalar(1.0));
  
  ball.position.copy(start);
  scene.add(ball);

  paintballs.push({
    mesh: ball,
    velocity: dir.multiplyScalar(40), // Faster
    color: color.clone(),
    life: 3 // seconds
  });
  
  // Trigger recoil
  player.recoil = 1.0;
}

// ----- Geometry import (Keep existing functionality) -----
const fileInput = document.getElementById("fileInput");
const loader = new GLTFLoader();

if (fileInput) {
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          buildingMeshes.push(obj);
        }
      });
      model.position.set(0, 0, 0);
      scene.add(model);
      URL.revokeObjectURL(url);
    });
  });
}

// ----- Game loop -----
const clock = new THREE.Clock();

// Initialize UI
updateScoreDisplay();
const vignetteEl = document.getElementById('vignette');
if (vignetteEl) vignetteEl.className = 'focused';

function update(delta) {
  if (mixer) mixer.update(delta);

  // Update mouse look
  if (isPointerLocked) {
    const sensitivity = 0.002;
    player.yaw -= mouseDeltaX * sensitivity;
    player.pitch -= mouseDeltaY * sensitivity;
    player.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, player.pitch));
    mouseDeltaX = 0;
    mouseDeltaY = 0;
  }

  // Movement
  const moveSpeed = 10;
  const move = new THREE.Vector3(0, 0, 0);

  if (keys["KeyW"]) move.z -= 1;
  if (keys["KeyS"]) move.z += 1;
  if (keys["KeyA"]) move.x -= 1;
  if (keys["KeyD"]) move.x += 1;

  if (move.lengthSq() > 0) {
    move.normalize();
    // Rotate movement by player yaw
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    
    // Standard WASD is relative to camera view
    const worldMove = new THREE.Vector3(
      move.x * cos - move.z * sin,
      0,
      move.x * sin + move.z * cos
    );
    player.velocity.x = worldMove.x * moveSpeed;
    player.velocity.z = worldMove.z * moveSpeed;
    
    // Face movement direction
    if (player.animations && player.animations.run) {
        if (player.currentAction !== 'run') {
             if (player.animations.idle) player.animations.idle.stop();
             player.animations.run.play();
             player.currentAction = 'run';
        }
    }
  } else {
    player.velocity.x = 0;
    player.velocity.z = 0;
    
    if (player.animations && player.animations.idle) {
        if (player.currentAction !== 'idle') {
             if (player.animations.run) player.animations.run.stop();
             player.animations.idle.play();
             player.currentAction = 'idle';
        }
    }
  }

  // Jump
  if (keys["Space"] && player.onGround) {
    player.velocity.y = 12;
    player.onGround = false;
  }

  // Gravity
  const gravity = -30;
  player.velocity.y += gravity * delta;

  // Integrate position
  const pos = player.mesh.position;
  pos.x += player.velocity.x * delta;
  pos.y += player.velocity.y * delta;
  pos.z += player.velocity.z * delta;

  // Ground collision
  const minY = 0; // Model pivot is usually at feet
  if (pos.y < minY) {
    pos.y = minY;
    player.velocity.y = 0;
    player.onGround = true;
  }

  // Rotate player mesh to face yaw + 180 (Soldier faces +Z, we want him to face -Z away from camera)
  player.mesh.rotation.y = player.yaw + Math.PI; 
  
  // Gun Recoil Animation
  if (player.gun && player.recoil > 0) {
      player.recoil -= delta * 5; // Decay recoil
      player.gun.position.z = 0.2 + Math.sin(player.recoil * 10) * 0.1; // Kick back
  } else if (player.gun) {
      player.gun.position.z = 0.2; // Reset position (matches offset in createGun attachment)
      player.recoil = 0;
  }  

  // Update targets - drift and oscillate
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    
    // Drift movement
    target.mesh.position.add(target.velocity.clone().multiplyScalar(delta));
    
    // Oscillation for more organic movement
    target.oscillation += delta;
    const oscillate = Math.sin(target.oscillation * 2) * 0.5;
    target.mesh.position.y += oscillate * delta;
    
    // Pulsing glow effect
    if (target.mesh.userData.materials) {
      const pulse = (Math.sin(target.oscillation * 3) + 1) * 0.5;
      target.mesh.userData.materials.forEach((mat, idx) => {
        if (idx === 2) { // Bullseye pulses more
          mat.emissiveIntensity = 0.6 + pulse * 0.4;
        }
      });
    }
    
    // Keep targets in bounds
    const maxDist = 50;
    if (target.mesh.position.length() > maxDist) {
      target.velocity.multiplyScalar(-1);
    }
    
    // Keep targets above ground
    if (target.mesh.position.y < 2) {
      target.mesh.position.y = 2;
      target.velocity.y = Math.abs(target.velocity.y);
    }
    
    // Rotate to face camera for better visibility
    target.mesh.lookAt(camera.position);
  }

  // Update paintballs with collision detection
  for (let i = paintballs.length - 1; i >= 0; i--) {
    const b = paintballs[i];
    b.life -= delta;
    
    if (b.life <= 0) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      paintballs.splice(i, 1);
      continue;
    }

    const oldPos = b.mesh.position.clone();
    b.mesh.position.add(b.velocity.clone().multiplyScalar(delta));

    // Check collision with targets
    for (let j = targets.length - 1; j >= 0; j--) {
      const target = targets[j];
      const dist = b.mesh.position.distanceTo(target.mesh.position);
      
      if (dist < target.hitRadius) {
        // Hit target!
        score += target.score;
        
        // Hit feedback on crosshair
        showHitFeedback();
        
        // Explosion effect
        createExplosion(target.mesh.position, b.color);
        
        // Remove target and respawn
        scene.remove(target.mesh);
        targets.splice(j, 1);
        targets.push(createTarget());
        
        // Remove paintball
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        paintballs.splice(i, 1);
        
        // Update score display
        updateScoreDisplay();
        break;
      }
    }
    
    if (paintballs.indexOf(b) === -1) continue; // Already removed

    // Raycast for collision with buildings
    const dir = b.velocity.clone().normalize();
    raycaster.set(oldPos, dir);
    const dist = oldPos.distanceTo(b.mesh.position);
    raycaster.far = dist;
    
    const intersects = raycaster.intersectObjects([...buildingMeshes, ground], true);
    
    if (intersects.length > 0) {
      const hit = intersects[0];
      
      // Create improved splatter (Decal)
      addDecal(hit, b.color);
      
      // Remove paintball
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      paintballs.splice(i, 1);
      continue;
    }

    // Backup ground collision
    if (b.mesh.position.y < 0) {
       scene.remove(b.mesh);
       paintballs.splice(i, 1);
    }
  }

  // First-person camera
  const eyeHeight = 1.6;
  const targetPos = player.mesh.position.clone().add(new THREE.Vector3(0, eyeHeight, 0));
  
  camera.position.copy(targetPos);
  
  // Add subtle camera sway in broad mode to simulate lack of focus
  if (focusMode === 'broad') {
    const time = Date.now() * 0.001;
    camera.position.x += Math.sin(time * 0.5) * 0.02;
    camera.position.y += Math.cos(time * 0.7) * 0.015;
  }
  
  // Look direction based on yaw and pitch
  const lookDir = new THREE.Vector3(
    -Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * Math.cos(player.pitch)
  );
  camera.lookAt(camera.position.clone().add(lookDir));
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  update(delta);
  renderer.render(scene, camera);
}

animate();

// ----- Resize handling -----
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
