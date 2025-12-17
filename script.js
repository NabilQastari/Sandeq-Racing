// ========== GAME CONSTANTS ==========
const DEBUG_HITBOXES = false; // Set to false to hide hitboxes

const GAME_STATES = {
    MENU: 'MENU',
    COUNTDOWN: 'COUNTDOWN',
    RACING: 'RACING',
    PAUSED: 'PAUSED',
    FINISHED: 'FINISHED'
};

const MAP_SIZE = { width: 1200, height: 16000 }; // 2x longer track
const FINISH_LINE_Y = MAP_SIZE.height / 2 - 100;
const START_LINE_Y = -MAP_SIZE.height / 2 + 200;

// ========== GAME STATE ==========
let gameState = GAME_STATES.MENU;
let scene, camera, renderer;
let player, npcs = [], obstacles = [], islands = [];
let bgMesh; // Background mesh for scrolling
let finishLine; // Finish line visual
let raceStartTime = 0;
let currentTime = 0;

// ========== AUDIO ==========
let menuMusic, seaAmbience, raceMusic, countdownSound, splashSound;

function initAudio() {
    menuMusic = new Audio('assets/menubacksound.mp3');
    menuMusic.loop = true;
    menuMusic.volume = 0.5;

    seaAmbience = new Audio('assets/seabacksound.mp3');
    seaAmbience.loop = true;
    seaAmbience.volume = 0.3;

    raceMusic = new Audio('assets/racebacksound.mp3');
    raceMusic.loop = true;
    raceMusic.volume = 0.4;

    countdownSound = new Audio('assets/countdown 3seconds+go.mp3');
    countdownSound.volume = 0.7;

    splashSound = new Audio('assets/splashsfx.mp3');
    splashSound.volume = 0.6;
    splashSound.volume = 0.6;
}

// ========== TOUCH CONTROLLER ==========
class TouchController {
    constructor() {
        this.zone = document.getElementById('joystickZone');
        this.knob = document.getElementById('joystickKnob');
        this.active = false;
        this.origin = { x: 0, y: 0 };
        this.position = { x: 0, y: 0 };
        this.value = { x: 0, y: 0 };
        this.maxDistance = 35; // Max radius for knob movement

        if (this.zone && this.knob) {
            this.initEvents();
        }
    }

    initEvents() {
        // Touch events
        this.zone.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
        this.zone.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
        this.zone.addEventListener('touchend', (e) => this.handleEnd(e));

        // Mouse events (for testing on desktop)
        this.zone.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }

    // Touch Handlers
    handleStart(e) {
        e.preventDefault();
        this.active = true;
        const touch = e.touches[0];
        this.startDrag(touch.clientX, touch.clientY);
    }

    handleMove(e) {
        if (!this.active) return;
        e.preventDefault();
        const touch = e.touches[0];
        this.updatePosition(touch.clientX, touch.clientY);
    }

    handleEnd(e) {
        this.stopDrag();
    }

    // Mouse Handlers
    handleMouseDown(e) {
        e.preventDefault();
        this.active = true;
        this.startDrag(e.clientX, e.clientY);
    }

    handleMouseMove(e) {
        if (!this.active) return;
        e.preventDefault();
        this.updatePosition(e.clientX, e.clientY);
    }

    handleMouseUp(e) {
        if (this.active) {
            this.stopDrag();
        }
    }

    // Common Logic
    startDrag(clientX, clientY) {
        const rect = this.zone.getBoundingClientRect();
        this.origin = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
        this.updatePosition(clientX, clientY);
    }

    stopDrag() {
        this.active = false;
        this.value = { x: 0, y: 0 };
        this.knob.style.transform = `translate(-50%, -50%)`;
    }

    updatePosition(clientX, clientY) {
        const dx = clientX - this.origin.x;
        const dy = clientY - this.origin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const clampedDistance = Math.min(distance, this.maxDistance);

        const x = Math.cos(angle) * clampedDistance;
        const y = Math.sin(angle) * clampedDistance;

        // Move knob
        this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

        // Normalize values (-1 to 1)
        // Invert Y because screen Y is down, game Y is up
        this.value = {
            x: x / this.maxDistance,
            y: -(y / this.maxDistance)
        };
    }

    getValues() {
        return this.value;
    }
}

let touchController;

// ========== TEXTURE LOADER ==========
const textureLoader = new THREE.TextureLoader();
const textures = {};

function loadTextures() {
    const assetPaths = {
        playerBoat: 'assets/perahu-main.png',
        npcBoat: 'assets/npc.png',
        obstacle1: 'assets/obstacle1-coral.png',
        obstacle2: 'assets/obstacle2-wood.png',
        obstacle3: 'assets/obstacle3-boat.png',
        background: 'assets/game-mainbackground.png',
        splash: 'assets/hit-splash-effect.png',
        menuBg: 'assets/menubackground.png',
        finishImg: 'assets/finish.png',
        island: 'assets/island.png'
    };

    // Load menu background
    document.getElementById('menuScreen').style.backgroundImage = `url('${assetPaths.menuBg}')`;

    // Load game textures
    Object.keys(assetPaths).forEach(key => {
        if (key !== 'menuBg') {
            textures[key] = textureLoader.load(assetPaths[key]);
        }
    });
}

// ========== PLAYER CLASS ==========
class Player {
    constructor() {
        const geometry = new THREE.PlaneGeometry(60, 80);
        const material = new THREE.MeshBasicMaterial({
            map: textures.playerBoat,
            transparent: true
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(0, START_LINE_Y, 0);

        // Add hitbox visualization - smaller radius for forgiving gameplay (20)
        this.radius = 20;
        if (DEBUG_HITBOXES) {
            const hitboxGeometry = new THREE.CircleGeometry(this.radius, 32);
            const hitboxMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            this.hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
            this.hitboxMesh.position.z = 0.5;
            this.mesh.add(this.hitboxMesh);

            // Add outline
            const outlineGeometry = new THREE.RingGeometry(this.radius - 1, this.radius + 1, 32);
            const outlineMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                side: THREE.DoubleSide
            });
            this.outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
            this.outlineMesh.position.z = 0.6;
            this.mesh.add(this.outlineMesh);
        }

        this.speed = 300;
        this.baseSpeed = 300; // Store base speed
        this.velocity = new THREE.Vector2(0, 0);
        this.invincible = false;
        this.invincibleTime = 0;
        this.slowedDown = false; // Track if boat is slowed
        this.slowdownTime = 0; // Time remaining for slowdown
        this.rotation = 0; // Current rotation in radians
        this.targetRotation = 0; // Target rotation
        this.lastCollisionTime = 0; // Track last collision time
        this.collisionCount = 0; // Track consecutive collisions
        this.lastStuckCheckTime = 0;
    }

    update(delta, keys) {
        if (gameState !== GAME_STATES.RACING) return;

        // Handle invincibility timer
        if (this.invincible) {
            this.invincibleTime -= delta;
            if (this.invincibleTime <= 0) {
                this.invincible = false;
            }
        }

        // Handle slowdown timer
        if (this.slowedDown) {
            this.slowdownTime -= delta;
            if (this.slowdownTime <= 0) {
                this.slowedDown = false;
                this.speed = this.baseSpeed; // Restore normal speed
            }
        }

        this.velocity.set(0, 0);
        let moving = false;

        if (keys['ArrowUp'] || keys['KeyW']) {
            this.velocity.y = 1;
            moving = true;
        }
        if (keys['ArrowDown'] || keys['KeyS']) {
            this.velocity.y = -1;
            moving = true;
        }
        if (keys['ArrowLeft'] || keys['KeyA']) {
            this.velocity.x = -1;
            moving = true;
        }
        if (keys['ArrowRight'] || keys['KeyD']) {
            this.velocity.x = 1;
            moving = true;
        }

        // Joystick input
        if (typeof touchController !== 'undefined') {
            const joystick = touchController.getValues();
            if (Math.abs(joystick.x) > 0.1 || Math.abs(joystick.y) > 0.1) {
                this.velocity.x = joystick.x;
                this.velocity.y = joystick.y;
                // Don't normalize if using analog input to allow slower speeds
                // But since we want consistent speed, we might want to normalize if magnitude > 1
                if (this.velocity.length() > 1) {
                    this.velocity.normalize();
                }
            }
        }

        if (this.velocity.length() > 0) {
            // Only normalize if length > 1 to allow analog control
            if (this.velocity.length() > 1) {
                this.velocity.normalize();
            }

            // Calculate target rotation based on movement direction
            this.targetRotation = Math.atan2(this.velocity.x, this.velocity.y);

            this.mesh.position.x += this.velocity.x * this.speed * delta;
            this.mesh.position.y += this.velocity.y * this.speed * delta;

            // Boundary check
            this.mesh.position.x = Math.max(-MAP_SIZE.width / 2 + 30, Math.min(MAP_SIZE.width / 2 - 30, this.mesh.position.x));
            this.mesh.position.y = Math.max(-MAP_SIZE.height / 2 + 40, Math.min(MAP_SIZE.height / 2 - 40, this.mesh.position.y));
        }

        // Smooth rotation interpolation
        let rotationDiff = this.targetRotation - this.rotation;

        // Normalize angle difference to [-PI, PI]
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        // Smooth rotation
        this.rotation += rotationDiff * delta * 8;
        this.mesh.rotation.z = -this.rotation;
    }

    getPosition() {
        return this.mesh.position.y;
    }

    handleCollision() {
        const currentTime = performance.now();
        // Prevent multiple collisions in quick succession
        if (this.invincible || currentTime - this.lastCollisionTime < 100) return;

        this.lastCollisionTime = currentTime;

        // Stuck detection logic
        if (currentTime - this.lastStuckCheckTime > 5000) {
            this.collisionCount = 0;
        }
        this.lastStuckCheckTime = currentTime;
        this.collisionCount++;

        if (this.collisionCount >= 5) {
            // Teleport back if stuck
            this.mesh.position.y -= 250;

            // Center the boat if near edges to prevent re-stuck
            if (Math.abs(this.mesh.position.x) > 200) {
                this.mesh.position.x *= 0.1;
            }

            this.collisionCount = 0;
            this.invincible = true;
            this.invincibleTime = 2.0;
            return true;
        }

        this.mesh.position.y -= 50; // Knockback
        this.invincible = true;
        this.invincibleTime = 1.0;

        // Apply speed penalty
        this.slowedDown = true;
        this.slowdownTime = 1.5; // Slow for 1.5 seconds
        this.speed = this.baseSpeed * 0.5; // Reduce speed to 50%

        return true; // Signal that collision was handled
    }

    reset() {
        this.mesh.position.set(this.startX || 0, START_LINE_Y, 0);
        this.velocity.set(0, 0);
        this.invincible = false;
        this.slowedDown = false;
        this.slowdownTime = 0;
        this.speed = this.baseSpeed;
        this.rotation = 0;
        this.targetRotation = 0;
        this.mesh.rotation.z = 0;
        this.lastCollisionTime = 0;
        this.collisionCount = 0;
        this.lastStuckCheckTime = 0;
    }
}

// ========== NPC CLASS ==========
class NPC {
    constructor(xOffset) {
        const geometry = new THREE.PlaneGeometry(60, 80);
        const material = new THREE.MeshBasicMaterial({
            map: textures.npcBoat,
            transparent: true
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(xOffset, START_LINE_Y, 0);
        this.startX = xOffset; // Store start position

        // Add hitbox visualization - smaller radius for forgiving gameplay (20)
        this.radius = 20;
        if (DEBUG_HITBOXES) {
            const hitboxGeometry = new THREE.CircleGeometry(this.radius, 32);
            const hitboxMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            this.hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
            this.hitboxMesh.position.z = 0.5;
            this.mesh.add(this.hitboxMesh);

            // Add outline
            const outlineGeometry = new THREE.RingGeometry(this.radius - 1, this.radius + 1, 32);
            const outlineMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                side: THREE.DoubleSide
            });
            this.outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
            this.outlineMesh.position.z = 0.6;
            this.mesh.add(this.outlineMesh);
        }

        this.speed = 200 + Math.random() * 100;
        this.baseSpeed = this.speed; // Store base speed
        this.invincible = false;
        this.invincibleTime = 0;
        this.slowedDown = false;
        this.slowdownTime = 0;
        this.avoidanceTimer = 0;
        this.avoidanceDirection = 0;
        this.rotation = 0;
        this.targetRotation = 0;
        this.targetRotation = 0;
        this.lastCollisionTime = 0;
        this.collisionCount = 0;
        this.lastStuckCheckTime = 0;
    }

    update(delta) {
        if (gameState !== GAME_STATES.RACING) return;

        // Handle invincibility timer
        if (this.invincible) {
            this.invincibleTime -= delta;
            if (this.invincibleTime <= 0) {
                this.invincible = false;
            }
        }

        // Handle slowdown timer
        if (this.slowedDown) {
            this.slowdownTime -= delta;
            if (this.slowdownTime <= 0) {
                this.slowedDown = false;
                this.speed = this.baseSpeed; // Restore normal speed
            }
        }

        // Smart AI: detect and avoid obstacles
        let moveX = 0;
        let moveY = 1;

        // Look ahead for obstacles
        const lookAheadDistance = 150;
        let nearestObstacle = null;
        let nearestDistance = Infinity;

        // Check all obstacles
        obstacles.forEach(obstacle => {
            const dx = obstacle.mesh.position.x - this.mesh.position.x;
            const dy = obstacle.mesh.position.y - this.mesh.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Only consider obstacles ahead
            if (dy > 0 && distance < lookAheadDistance && distance < nearestDistance) {
                nearestDistance = distance;
                nearestObstacle = obstacle;
            }
        });

        // Check islands too
        islands.forEach(island => {
            const dx = island.mesh.position.x - this.mesh.position.x;
            const dy = island.mesh.position.y - this.mesh.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (dy > 0 && distance < lookAheadDistance + 100 && distance < nearestDistance) {
                nearestDistance = distance;
                nearestObstacle = island;
            }
        });

        // Avoid obstacle if detected
        if (nearestObstacle) {
            const dx = nearestObstacle.mesh.position.x - this.mesh.position.x;
            // Steer away from obstacle
            if (Math.abs(dx) < 60) {
                // Obstacle is directly ahead, steer to the side with more space
                moveX = dx > 0 ? -1.5 : 1.5;
            } else {
                moveX = dx > 0 ? -0.8 : 0.8;
            }
        } else if (this.avoidanceTimer > 0) {
            // Continue previous avoidance
            this.avoidanceTimer -= delta;
            moveX = this.avoidanceDirection;
        } else {
            // Random slight movements for natural behavior
            if (Math.random() < 0.01) {
                this.avoidanceDirection = (Math.random() - 0.5) * 0.5;
                this.avoidanceTimer = 0.3;
            }
        }

        // Calculate target rotation
        this.targetRotation = Math.atan2(moveX * 0.4, moveY);

        // Smooth rotation
        let rotationDiff = this.targetRotation - this.rotation;
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        this.rotation += rotationDiff * delta * 8;
        this.mesh.rotation.z = -this.rotation;

        // Move NPC
        this.mesh.position.x += moveX * this.speed * delta * 0.3;
        this.mesh.position.y += moveY * this.speed * delta;

        // Boundary check
        this.mesh.position.x = Math.max(-MAP_SIZE.width / 2 + 30, Math.min(MAP_SIZE.width / 2 - 30, this.mesh.position.x));
    }

    getPosition() {
        return this.mesh.position.y;
    }

    handleCollision() {
        const currentTime = performance.now();
        if (this.invincible || currentTime - this.lastCollisionTime < 100) return;

        this.lastCollisionTime = currentTime;

        // Stuck detection logic
        if (currentTime - this.lastStuckCheckTime > 5000) {
            this.collisionCount = 0;
        }
        this.lastStuckCheckTime = currentTime;
        this.collisionCount++;

        if (this.collisionCount >= 5) {
            // Teleport back if stuck
            this.mesh.position.y -= 250;

            // Center the boat if near edges to prevent re-stuck
            if (Math.abs(this.mesh.position.x) > 200) {
                this.mesh.position.x *= 0.1;
            }

            this.collisionCount = 0;
            this.invincible = true;
            this.invincibleTime = 2.0;
            return true;
        }

        this.mesh.position.y -= 50;
        this.invincible = true;
        this.invincibleTime = 1.0;

        // Apply speed penalty
        this.slowedDown = true;
        this.slowdownTime = 1.5; // Slow for 1.5 seconds
        this.speed = this.baseSpeed * 0.5; // Reduce speed to 50%

        // Change direction after collision
        this.avoidanceDirection = (Math.random() - 0.5) * 2;
        this.avoidanceTimer = 1.0;

        return true;
    }

    reset() {
        this.mesh.position.set(this.startX, START_LINE_Y, 0);
        this.invincible = false;
        this.slowedDown = false;
        this.slowdownTime = 0;
        this.speed = this.baseSpeed;
        this.rotation = 0;
        this.targetRotation = 0;
        this.mesh.rotation.z = 0;
        this.lastCollisionTime = 0;
        this.collisionCount = 0;
        this.lastStuckCheckTime = 0;
    }
}

// ========== OBSTACLE CLASS ==========
class Obstacle {
    constructor(x, y, type) {
        const geometry = new THREE.PlaneGeometry(50, 50);
        const textureKey = `obstacle${type}`;
        const material = new THREE.MeshBasicMaterial({
            map: textures[textureKey],
            transparent: true
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, 0);

        // Add random rotation
        this.mesh.rotation.z = Math.random() * Math.PI * 2; // Random rotation 0 to 2π (0 to 360 degrees)

        // Hitbox radius smaller than sprite for forgiving collisions (15)
        this.radius = 15;

        // Add hitbox visualization
        if (DEBUG_HITBOXES) {
            const hitboxGeometry = new THREE.CircleGeometry(this.radius, 32);
            const hitboxMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            this.hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
            this.hitboxMesh.position.z = 0.5;
            this.mesh.add(this.hitboxMesh);

            // Add outline
            const outlineGeometry = new THREE.RingGeometry(this.radius - 1, this.radius + 1, 32);
            const outlineMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                side: THREE.DoubleSide
            });
            this.outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
            this.outlineMesh.position.z = 0.6;
            this.mesh.add(this.outlineMesh);
        }
    }
}

// ========== ISLAND CLASS ==========
class Island {
    constructor(x, y) {
        const geometry = new THREE.PlaneGeometry(500, 500); // Bigger islands - 5x bigger than obstacles
        const material = new THREE.MeshBasicMaterial({
            map: textures.island,
            transparent: true
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, 0);

        // Fixed rotation (no random rotation)
        this.mesh.rotation.z = 0;

        this.radius = 150; // Bigger hitbox for bigger islands

        // Add hitbox visualization
        if (DEBUG_HITBOXES) {
            const hitboxGeometry = new THREE.CircleGeometry(this.radius, 32);
            const hitboxMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ffff, // Cyan color for islands
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            this.hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
            this.hitboxMesh.position.z = 0.5;
            this.mesh.add(this.hitboxMesh);

            // Add outline
            const outlineGeometry = new THREE.RingGeometry(this.radius - 1, this.radius + 1, 32);
            const outlineMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                side: THREE.DoubleSide
            });
            this.outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
            this.outlineMesh.position.z = 0.6;
            this.mesh.add(this.outlineMesh);
        }
    }
}

// ========== SPLASH EFFECT ==========
class SplashEffect {
    constructor(x, y) {
        const geometry = new THREE.PlaneGeometry(180, 180); // Even bigger splash
        const material = new THREE.MeshBasicMaterial({
            map: textures.splash,
            transparent: true,
            opacity: 0 // Start invisible for fade-in
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, 1);
        this.mesh.scale.set(0.3, 0.3, 1); // Start small
        this.lifetime = 0.8; // Longer lifetime for smooth animation
        this.maxLifetime = 0.8;
        this.active = true;
        scene.add(this.mesh);
    }

    update(delta) {
        this.lifetime -= delta;

        // Calculate animation progress (0 to 1)
        const progress = 1 - (this.lifetime / this.maxLifetime);

        // Fade in quickly, then fade out
        if (progress < 0.2) {
            // Fade in during first 20% of lifetime
            this.mesh.material.opacity = progress / 0.2;
        } else {
            // Fade out during remaining 80%
            this.mesh.material.opacity = (this.lifetime / this.maxLifetime);
        }

        // Scale up smoothly
        const scale = 0.3 + (progress * 0.7); // Scale from 0.3 to 1.0
        this.mesh.scale.set(scale, scale, 1);

        if (this.lifetime <= 0) {
            this.active = false;
            scene.remove(this.mesh);
        }
    }
}

let splashEffects = [];

// ========== COLLISION DETECTION ==========
function checkCollision(obj1, obj2, radius1 = 25, radius2 = 25) {
    const dx = obj1.mesh.position.x - obj2.mesh.position.x;
    const dy = obj1.mesh.position.y - obj2.mesh.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < (radius1 + radius2);
}

// Collision response with physics - pushes objects apart to prevent clipping
function resolveCollision(obj1, obj2, radius1, radius2) {
    const dx = obj1.mesh.position.x - obj2.mesh.position.x;
    const dy = obj1.mesh.position.y - obj2.mesh.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < (radius1 + radius2) && distance > 0) {
        // Calculate overlap
        const overlap = (radius1 + radius2) - distance;

        // Normalize direction vector
        const nx = dx / distance;
        const ny = dy / distance;

        // Push obj1 away from obj2
        obj1.mesh.position.x += nx * overlap;
        obj1.mesh.position.y += ny * overlap;

        return true;
    }
    return false;
}

// ========== SCENE SETUP ==========
function initThreeJS() {
    scene = new THREE.Scene();

    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 600;
    camera = new THREE.OrthographicCamera(
        -viewSize * aspect / 2, viewSize * aspect / 2,
        viewSize / 2, -viewSize / 2,
        0.1, 1000
    );
    camera.position.z = 10;

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('gameCanvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x001f3f);

    // Add scrolling background
    // Add scrolling background - wider and taller to cover all boundaries
    const bgGeometry = new THREE.PlaneGeometry(MAP_SIZE.width * 4, MAP_SIZE.height * 1.5);

    // Enable texture wrapping for seamless scrolling and tiling
    textures.background.wrapS = THREE.RepeatWrapping;
    textures.background.wrapT = THREE.RepeatWrapping;
    textures.background.repeat.set(4, 12); // Repeat 4x horizontally, 12x vertically

    const bgMaterial = new THREE.MeshBasicMaterial({
        map: textures.background
    });
    bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.position.z = -1;
    scene.add(bgMesh);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 600;
    camera.left = -viewSize * aspect / 2;
    camera.right = viewSize * aspect / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ========== MAP GENERATION ==========
function generateMap() {
    // Remove existing obstacles and islands from scene
    if (obstacles) obstacles.forEach(o => scene.remove(o.mesh));
    if (islands) islands.forEach(i => scene.remove(i.mesh));

    // Helper function to check if position is too close to existing objects
    function isTooClose(x, y, radius, existingObjects, minDistance) {
        for (let obj of existingObjects) {
            const dx = x - obj.mesh.position.x;
            const dy = y - obj.mesh.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < (radius + obj.radius + minDistance)) {
                return true;
            }
        }
        return false;
    }

    // Create obstacles randomly with spacing
    obstacles = [];
    const obstacleCount = 200; // More obstacles for longer track
    const minObstacleDistance = 40; // Smaller gap but still passable
    let attempts = 0;
    const maxAttempts = obstacleCount * 10;

    while (obstacles.length < obstacleCount && attempts < maxAttempts) {
        attempts++;
        const x = (Math.random() - 0.5) * (MAP_SIZE.width - 200);
        const y = START_LINE_Y + 300 + Math.random() * (FINISH_LINE_Y - START_LINE_Y - 600);
        const type = Math.floor(Math.random() * 3) + 1;

        // Check distance from player and NPCs
        const allBoats = [player, ...npcs];
        let tooCloseToBoat = false;
        for (let boat of allBoats) {
            const dx = x - boat.mesh.position.x;
            const dy = y - boat.mesh.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 200) { // Keep obstacles away from starting area
                tooCloseToBoat = true;
                break;
            }
        }

        if (!tooCloseToBoat && !isTooClose(x, y, 15, obstacles, minObstacleDistance)) {
            const obstacle = new Obstacle(x, y, type);
            obstacles.push(obstacle);
            scene.add(obstacle.mesh);
        }
    }

    // Create islands on the edges with spacing (moved slightly toward center)
    islands = [];
    const islandCount = 6 + Math.floor(Math.random() * 5);
    const minIslandDistance = 400; // Minimum gap between islands
    attempts = 0;

    while (islands.length < islandCount && attempts < islandCount * 20) {
        attempts++;
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side * (MAP_SIZE.width / 2 - 100 - Math.random() * 50);
        const safeZone = 1500; // Safe zone from start
        const y = START_LINE_Y + safeZone + Math.random() * (FINISH_LINE_Y - START_LINE_Y - safeZone);

        if (!isTooClose(x, y, 180, islands, minIslandDistance)) {
            const island = new Island(x, y);
            islands.push(island);
            scene.add(island.mesh);
        }
    }
}

// ========== GAME INITIALIZATION ==========
function initGame() {
    // Define 6 fixed spawn positions (lanes)
    // Centered around 0: -375, -225, -75, 75, 225, 375
    const spawnPositions = [-375, -225, -75, 75, 225, 375];

    // Shuffle positions randomly
    for (let i = spawnPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [spawnPositions[i], spawnPositions[j]] = [spawnPositions[j], spawnPositions[i]];
    }

    // Create player at the first random position
    player = new Player();
    player.startX = spawnPositions[0]; // Store for reset
    player.mesh.position.x = player.startX;
    scene.add(player.mesh);

    // Create NPCs at the remaining 5 positions
    npcs = [
        new NPC(spawnPositions[1]),
        new NPC(spawnPositions[2]),
        new NPC(spawnPositions[3]),
        new NPC(spawnPositions[4]),
        new NPC(spawnPositions[5])
    ];
    npcs.forEach(npc => scene.add(npc.mesh));

    // Generate map content (obstacles and islands)
    generateMap();

    // Create boundary lines
    const boundaryMaterial = new THREE.MeshBasicMaterial({
        color: 0x00aaff, // Sea blue color
        side: THREE.DoubleSide
    });
    const boundaryGeometry = new THREE.PlaneGeometry(5, MAP_SIZE.height); // 5 units wide (thinner)

    // Left Boundary
    const leftBoundary = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
    leftBoundary.position.set(-MAP_SIZE.width / 2, 0, 0.1);
    scene.add(leftBoundary);

    // Right Boundary
    const rightBoundary = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
    rightBoundary.position.set(MAP_SIZE.width / 2, 0, 0.1);
    scene.add(rightBoundary);

    // Create finish line with checkered pattern
    const finishCanvas = document.createElement('canvas');
    finishCanvas.width = 512;
    finishCanvas.height = 64;
    const ctx = finishCanvas.getContext('2d');

    // Draw checkered pattern
    const squareSize = 64;
    for (let y = 0; y < finishCanvas.height; y += squareSize) {
        for (let x = 0; x < finishCanvas.width; x += squareSize) {
            const isBlack = ((x / squareSize) + (y / squareSize)) % 2 === 0;
            ctx.fillStyle = isBlack ? '#000000' : '#ffffff';
            ctx.fillRect(x, y, squareSize, squareSize);
        }
    }

    const finishTexture = new THREE.CanvasTexture(finishCanvas);
    const finishGeometry = new THREE.PlaneGeometry(MAP_SIZE.width, 80);
    const finishMaterial = new THREE.MeshBasicMaterial({
        map: finishTexture,
        transparent: true,
        opacity: 0.9
    });
    finishLine = new THREE.Mesh(finishGeometry, finishMaterial);
    finishLine.position.set(0, FINISH_LINE_Y, 0.1);
    scene.add(finishLine);
}

// ========== OFF-SCREEN INDICATORS ==========
function updateIndicators() {
    const container = document.getElementById('indicators');
    container.innerHTML = '';

    // Viewport boundaries in world coordinates
    const viewSize = 600; // From initThreeJS
    const aspect = window.innerWidth / window.innerHeight;
    const halfHeight = viewSize / 2;
    const halfWidth = halfHeight * aspect;

    npcs.forEach((npc, index) => {
        // Calculate relative position from camera center
        const dx = npc.mesh.position.x - camera.position.x;
        const dy = npc.mesh.position.y - camera.position.y;

        // Check if off-screen
        if (Math.abs(dx) > halfWidth || Math.abs(dy) > halfHeight) {
            const indicator = document.createElement('div');
            indicator.className = 'cam-indicator';

            // Calculate projection to screen edge
            // We want to find t such that (dx*t, dy*t) is on the edge
            const tx = (halfWidth - 20) / Math.abs(dx); // -20 for padding
            const ty = (halfHeight - 20) / Math.abs(dy);
            const t = Math.min(tx, ty);

            const edgeX = dx * t;
            const edgeY = dy * t;

            // Convert to screen percentage (0-100)
            // Screen Y is inverted relative to World Y
            const screenX = (edgeX + halfWidth) / (halfWidth * 2) * 100;
            const screenY = (1 - (edgeY + halfHeight) / (halfHeight * 2)) * 100;

            // Rotation: Arrow points towards NPC relative to screen center
            // Screen vector is (dx, -dy) because Y is inverted
            const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
            // Our default arrow points UP (0, -1). 
            // atan2(-1, 0) is -90 deg. We want -90 to map to 0 rotation.
            // So rotation = angle + 90
            const rotation = angle + 90;

            indicator.style.left = `${screenX}%`;
            indicator.style.top = `${screenY}%`;
            indicator.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

            container.appendChild(indicator);
        }
    });
}

function resetGame() {
    // Re-shuffle spawn positions for variety
    const spawnPositions = [-375, -225, -75, 75, 225, 375];
    for (let i = spawnPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [spawnPositions[i], spawnPositions[j]] = [spawnPositions[j], spawnPositions[i]];
    }

    // Assign new positions
    player.startX = spawnPositions[0];

    // Assign remaining positions to NPCs
    npcs.forEach((npc, index) => {
        npc.startX = spawnPositions[index + 1];
    });

    player.reset();
    npcs.forEach(npc => npc.reset());

    // Regenerate the world (obstacles & islands) on every restart
    generateMap();

    splashEffects = [];
    raceStartTime = 0;
    currentTime = 0;
}

// ========== KEYBOARD INPUT ==========
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// ========== UI FUNCTIONS ==========
function showMenu() {
    document.getElementById('menuScreen').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('countdown').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('countdown').style.display = 'none';
    document.getElementById('finishScreen').style.display = 'none';

    // Clear indicators
    const indicatorsEl = document.getElementById('indicators');
    if (indicatorsEl) indicatorsEl.innerHTML = '';

    // Hide mobile controls
    document.getElementById('mobileControls').classList.add('hidden');

    // Play menu music
    if (menuMusic) {
        seaAmbience?.pause();
        raceMusic?.pause();
        menuMusic.currentTime = 0;
        menuMusic.play().catch(e => console.log('Audio play failed:', e));
    }
}

function hideMenu() {
    document.getElementById('menuScreen').classList.add('hidden');
}

function showCountdown() {
    document.getElementById('countdown').style.display = 'block';
}

function hideCountdown() {
    document.getElementById('countdown').style.display = 'none';
}

function showHUD() {
    document.getElementById('hud').style.display = 'block';
    document.getElementById('pauseBtn').style.display = 'block';
}

function pauseGame() {
    if (gameState === GAME_STATES.RACING) {
        gameState = GAME_STATES.PAUSED;
        document.getElementById('pauseMenu').style.display = 'flex';

        // Pause race music
        raceMusic?.pause();
    }
}

function resumeGame() {
    if (gameState === GAME_STATES.PAUSED) {
        gameState = GAME_STATES.RACING;
        document.getElementById('pauseMenu').style.display = 'none';

        // Resume race music
        raceMusic?.play().catch(e => console.log('Audio play failed:', e));
    }
}

function showFinish() {
    document.getElementById('finishScreen').style.display = 'flex';
}

async function startCountdown() {
    gameState = GAME_STATES.COUNTDOWN;
    hideMenu();

    // Show mobile controls (if on mobile, CSS media query allows it to show)
    document.getElementById('mobileControls').classList.remove('hidden');

    // Stop menu music, start sea ambience and countdown sound
    menuMusic?.pause();
    if (seaAmbience) {
        seaAmbience.currentTime = 0;
        seaAmbience.play().catch(e => console.log('Audio play failed:', e));
    }
    if (countdownSound) {
        countdownSound.currentTime = 0;
        countdownSound.play().catch(e => console.log('Audio play failed:', e));
    }

    // Position camera at player start position
    camera.position.x = player.mesh.position.x;
    camera.position.y = player.mesh.position.y;

    showCountdown();

    const countdownEl = document.getElementById('countdown');

    // Changed to 3 seconds countdown
    for (let i = 3; i > 0; i--) {
        countdownEl.textContent = i;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    countdownEl.textContent = 'GO!';
    await new Promise(resolve => setTimeout(resolve, 500));

    hideCountdown();
    startRace();
}

function startRace() {
    gameState = GAME_STATES.RACING;
    showHUD();
    raceStartTime = performance.now();

    // Start race music
    seaAmbience?.pause();
    if (raceMusic) {
        raceMusic.currentTime = 0;
        raceMusic.play().catch(e => console.log('Audio play failed:', e));
    }
}

function finishRace(position) {
    gameState = GAME_STATES.FINISHED;

    // Clear indicators
    const indicatorsEl = document.getElementById('indicators');
    if (indicatorsEl) indicatorsEl.innerHTML = '';

    // Hide mobile controls
    document.getElementById('mobileControls').classList.add('hidden');

    document.getElementById('finalTime').textContent = `Time: ${formatTime(currentTime)}`;
    document.getElementById('finalPosition').textContent = `Position: ${getPositionText(position)}`;

    showFinish();
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
}

function getPositionText(pos) {
    if (pos === 1) return '1st';
    if (pos === 2) return '2nd';
    if (pos === 3) return '3rd';
    if (pos === 4) return '4th';
    if (pos === 5) return '5th';
    if (pos === 6) return '6th';
    return pos + 'th'; // Fallback for any position beyond 6th
}

function updateHUD() {
    if (gameState === GAME_STATES.RACING) {
        currentTime = performance.now() - raceStartTime;
        document.getElementById('timer').textContent = `Time: ${formatTime(currentTime)}`;

        // Calculate position
        const allRacers = [player, ...npcs].sort((a, b) => b.getPosition() - a.getPosition());
        const position = allRacers.indexOf(player) + 1;
        document.getElementById('position').textContent = `Position: ${getPositionText(position)}`;

        // Check finish line
        if (player.getPosition() >= FINISH_LINE_Y) {
            finishRace(position);
        }

        updateIndicators();
    }
}

// ========== GAME LOOP ==========
let lastTime = performance.now();

function gameLoop() {
    requestAnimationFrame(gameLoop);

    const currentTime = performance.now();
    const delta = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (gameState === GAME_STATES.RACING) {
        // Update player
        player.update(delta, keys);

        // Update NPCs
        npcs.forEach(npc => npc.update(delta));

        // Check collisions with physics-based response
        const allBoats = [player, ...npcs];

        // Check boat-to-obstacle collisions
        allBoats.forEach(boat => {
            // Check obstacle collisions with proper physics
            obstacles.forEach(obstacle => {
                if (checkCollision(boat, obstacle, boat.radius, obstacle.radius)) {
                    // Apply physics push-back to prevent clipping
                    resolveCollision(boat, obstacle, boat.radius, obstacle.radius);

                    const collisionHandled = boat.handleCollision();
                    // Only create splash if collision was actually handled (not during invincibility)
                    if (collisionHandled) {
                        // Calculate splash position in front of the boat based on rotation
                        const offset = 40;
                        const splashX = boat.mesh.position.x + Math.sin(boat.rotation) * offset;
                        const splashY = boat.mesh.position.y + Math.cos(boat.rotation) * offset;
                        splashEffects.push(new SplashEffect(splashX, splashY));

                        // Play splash sound only if close to player (proximity-based)
                        if (splashSound && player) {
                            const dx = splashX - player.mesh.position.x;
                            const dy = splashY - player.mesh.position.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            const maxHearingDistance = 300; // Can hear splashes within 300 units

                            if (distance < maxHearingDistance) {
                                // Volume decreases with distance
                                const volumeScale = 1 - (distance / maxHearingDistance);
                                const sound = splashSound.cloneNode();
                                sound.volume = 0.6 * volumeScale;
                                sound.play().catch(e => console.log('Audio play failed:', e));
                            }
                        }
                    }
                }
            });

            // Check island collisions with proper physics
            islands.forEach(island => {
                if (checkCollision(boat, island, boat.radius, island.radius)) {
                    // Apply physics push-back to prevent clipping
                    resolveCollision(boat, island, boat.radius, island.radius);

                    const collisionHandled = boat.handleCollision();
                    if (collisionHandled) {
                        // Calculate splash position in front of the boat based on rotation
                        const offset = 40;
                        const splashX = boat.mesh.position.x + Math.sin(boat.rotation) * offset;
                        const splashY = boat.mesh.position.y + Math.cos(boat.rotation) * offset;
                        splashEffects.push(new SplashEffect(splashX, splashY));

                        // Play splash sound only if close to player (proximity-based)
                        if (splashSound && player) {
                            const dx = splashX - player.mesh.position.x;
                            const dy = splashY - player.mesh.position.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            const maxHearingDistance = 300;

                            if (distance < maxHearingDistance) {
                                const volumeScale = 1 - (distance / maxHearingDistance);
                                const sound = splashSound.cloneNode();
                                sound.volume = 0.6 * volumeScale;
                                sound.play().catch(e => console.log('Audio play failed:', e));
                            }
                        }
                    }
                }
            });
        });

        // Check boat-to-boat collisions
        for (let i = 0; i < allBoats.length; i++) {
            for (let j = i + 1; j < allBoats.length; j++) {
                const boat1 = allBoats[i];
                const boat2 = allBoats[j];

                if (checkCollision(boat1, boat2, boat1.radius, boat2.radius)) {
                    // Apply physics push-back to prevent boats from clipping through each other
                    const dx = boat1.mesh.position.x - boat2.mesh.position.x;
                    const dy = boat1.mesh.position.y - boat2.mesh.position.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > 0) {
                        const overlap = (boat1.radius + boat2.radius) - distance;
                        const nx = dx / distance;
                        const ny = dy / distance;

                        // Push both boats apart equally
                        boat1.mesh.position.x += nx * overlap * 0.5;
                        boat1.mesh.position.y += ny * overlap * 0.5;
                        boat2.mesh.position.x -= nx * overlap * 0.5;
                        boat2.mesh.position.y -= ny * overlap * 0.5;
                    }
                }
            }
        }

        // Update splash effects
        splashEffects = splashEffects.filter(splash => {
            splash.update(delta);
            return splash.active;
        });

        // Scroll background vertically
        if (bgMesh && bgMesh.material.map) {
            bgMesh.material.map.offset.y += delta * 0.02; // Slower scrolling speed
        }

        // Camera follow player
        camera.position.x = player.mesh.position.x;
        camera.position.y = player.mesh.position.y;

        // Update HUD
        updateHUD();
    }

    renderer.render(scene, camera);
}

// ========== EVENT LISTENERS ==========
document.getElementById('startBtn').addEventListener('click', () => {
    resetGame();
    startCountdown();
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    pauseGame();
});

document.getElementById('resumeBtn').addEventListener('click', () => {
    resumeGame();
});

document.getElementById('pauseMenuBtn').addEventListener('click', () => {
    document.getElementById('pauseMenu').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    gameState = GAME_STATES.MENU;
    showMenu();

    // Clear indicators logic
    document.getElementById('indicators').innerHTML = '';

    // Reset camera
    camera.position.x = 0;
    camera.position.y = 0;
});

document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('finishScreen').style.display = 'none';
    resetGame();
    startCountdown();
});

document.getElementById('menuBtn').addEventListener('click', () => {
    document.getElementById('finishScreen').style.display = 'none';
    gameState = GAME_STATES.MENU;
    showMenu();

    // Clear indicators logic
    document.getElementById('indicators').innerHTML = '';

    // Reset camera
    camera.position.x = 0;
    camera.position.y = 0;
});

document.getElementById('creditsBtn').addEventListener('click', () => {
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('creditsScreen').classList.remove('hidden');
    document.getElementById('creditsScreen').style.display = 'flex'; // Ensure flex layout
});

document.getElementById('creditsBackBtn').addEventListener('click', () => {
    document.getElementById('creditsScreen').classList.add('hidden');
    document.getElementById('creditsScreen').style.display = 'none';
    document.getElementById('menuScreen').classList.remove('hidden');
});

// ========== INITIALIZATION ==========
initAudio();
loadTextures();
setTimeout(() => {
    initThreeJS();
    initGame();
    touchController = new TouchController();
    showMenu();
    gameLoop();
}, 100);
