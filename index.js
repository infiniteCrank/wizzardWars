import * as THREE from "three";

// ----- Scene Setup -----
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ----- Physics World -----
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// ----- Create Ground -----
const groundGeometry = new THREE.PlaneGeometry(10, 10);
const groundMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// ----- Global Arrays & Constants -----
let platforms = [];          // For enemy obstacle avoidance
let collectibleCubes = [];   // Cubes available for both player & enemy
const cubesToRemove = [];
let totalCubes = 5;          // Total cubes per round
let currentRoundCubeCount = 0; // Current round cube counter

const PROJECTILE_SPEED = 2;
const PROJECTILE_LIFETIME = 3000;
const ENEMY_PROJECTILE_SPEED = 2;
const ENEMY_PROJECTILE_LIFETIME = 3000;
const DAMAGE_AMOUNT = 10;    // Both projectiles deal 10 damage

// ----- Projectile Class -----
class Projectile {
    constructor(position, direction, speed, lifetime) {
        this.geometry = new THREE.SphereGeometry(0.1, 16, 16);
        this.material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.copy(position);
        this.direction = direction.clone().normalize();
        this.speed = speed;
        this.lifetime = lifetime;
        this.startTime = Date.now();
    }
    update() {
        const elapsedTime = Date.now() - this.startTime;
        if (elapsedTime > this.lifetime) {
            this.dispose();
            return;
        }
        this.mesh.position.add(
            this.direction.clone().multiplyScalar(this.speed * (1 / 60))
        );
    }
    dispose() {
        scene.remove(this.mesh);
        this.geometry.dispose();
        this.material.dispose();
    }
}

// ----- Player Class -----
class Player {
    constructor(scene, world) {
        this.health = 100;
        this.maxHealth = 100;
        this.kills = 0;  // Track the number of kills
        this.projectiles = [];
        this.shootCooldown = 1000;
        this.lastShotTime = 0;
        this.cubeCount = 0;
        this.speed = 5;
        this.scene = scene;
        this.world = world;
        this.isAlive = true;
        this.geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        scene.add(this.mesh);
        this.body = new CANNON.Body({
            mass: 1,
            linearDamping: 0.9,
            angularDamping: 1,
        });
        this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.25)));
        this.body.position.set(0, 2.5, 0);
        world.addBody(this.body);
    }
    shoot() {
        if (!this.isAlive || Date.now() - this.lastShotTime < this.shootCooldown) return;
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.mesh.quaternion);
        const newProjectile = new Projectile(
            this.mesh.position.clone(),
            direction,
            PROJECTILE_SPEED,
            PROJECTILE_LIFETIME
        );
        this.projectiles.push(newProjectile);
        this.scene.add(newProjectile.mesh);
        // Update last shot time
        this.lastShotTime = Date.now();
    }
    respawn() {
        this.health = this.maxHealth;
        this.isAlive = true;
        this.scene.add(this.mesh);
        this.world.addBody(this.body);
        const min = -5, max = 5;
        const randomX = Math.random() * (max - min) + min;
        const randomZ = Math.random() * (max - min) + min;
        this.mesh.position.set(randomX, 2.5, randomZ);
        this.body.position.set(randomX, 2.5, randomZ);
        console.log("Player has respawned!");
        this.updateHealthBar();
    }
    update(keys) {
        console.log(keys)
        if (!this.isAlive) return;
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);
        const targetVelocity = new CANNON.Vec3(0, 0, 0);
        if (keys["ArrowUp"]) targetVelocity.z = -this.speed;
        if (keys["ArrowDown"]) targetVelocity.z = this.speed;
        if (keys["ArrowLeft"]) targetVelocity.x = -this.speed;
        if (keys["ArrowRight"]) targetVelocity.x = this.speed;
        if (keys["KeyH"]) this.activateHealthRegen();
        if (targetVelocity.x !== 0 || targetVelocity.z !== 0) {
            const direction = new THREE.Vector3(
                targetVelocity.x,
                0,
                targetVelocity.z
            ).normalize();
            this.mesh.lookAt(this.mesh.position.clone().add(direction));
        }
        this.body.velocity.x = targetVelocity.x;
        this.body.velocity.z = targetVelocity.z;
        this.projectiles.forEach((projectile) => projectile.update());
        this.projectiles = this.projectiles.filter(
            (projectile) => projectile.mesh.parent !== null
        );
        this.updateHealthBar();
    }
    takeDamage(amount) {
        if (!this.isAlive) return;
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            console.log("Player is dead!");
            this.isAlive = false;
            this.scene.remove(this.mesh);
            this.world.removeBody(this.body);
            this.removeAllProjectiles();
            // Increment the enemy's kill count
            enemy.kills++;
            // Check for win condition
            if (enemy.kills >= 3) {
                displayWinner("Enemy wins!");
                return;
            }
            setTimeout(() => this.respawn(), 10000); // Respawn after 10 sec
        } else {
            this.updateHealthBar();
        }
    }
    activateCooldownReduction() {
        if (this.spendCubes(10)) { // Cost of the power-up
            this.shootCooldown /= 2; // Halve the cooldown
            console.log("Projectile cooldown reduced!");
            // Restore the cooldown after 10 seconds
            setTimeout(() => {
                this.shootCooldown *= 2; // Restore original cooldown
                console.log("Projectile cooldown restored!");
            }, 10000);
        } else {
            console.log("Not enough cubes to activate cooldown reduction!");
        }
    }
    removeAllProjectiles() {
        this.projectiles.forEach((projectile) => {
            projectile.dispose();
        });
        this.projectiles.length = 0;
    }
    updateHealthBar() {
        const healthBarElement = document.getElementById("health-bar");
        if (healthBarElement) {
            const healthPercentage = (this.health / this.maxHealth) * 100;
            healthBarElement.style.width = healthPercentage + "%";
            healthBarElement.style.background =
                healthPercentage < 30 ? "red" : "green";
        }
    }
    activateHealthRegen() {
        if (this.spendCubes(10)) { // Cost of the power-up
            this.health = Math.min(this.health + this.maxHealth / 2, this.maxHealth);
            this.updateHealthBar();
            // Update the cube display after spending cubes
            const cubeDisplay = document.getElementById("player-cubes");
            if (cubeDisplay) {
                cubeDisplay.innerText = "Player Cubes: " + this.cubeCount;
            }
            console.log("Health Regenerated!");
        } else {
            console.log("Not enough cubes to activate Health Regeneration!");
        }
    }
    spendCubes(amount) {
        if (this.cubeCount >= amount) {
            this.cubeCount -= amount;
            return true;
        }
        return false;
    }
}

// ----- Enemy Class (with Health & Health Bar) -----
class Enemy {
    constructor(scene, world, player) {
        this.scene = scene;
        this.world = world;
        this.player = player;
        this.health = 100;
        this.maxHealth = 100;
        this.cubeCount = 0;
        this.kills = 0;  // Track the number of kills
        this.projectiles = [];
        // This variable controls the enemy's movement speed.
        this.movementSpeed = 1;
        this.isAlive = true;
        this.shootCooldown = 1000;
        this.lastShotTime = 0;
        this.geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.material = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        scene.add(this.mesh);
        this.body = new CANNON.Body({
            mass: 1,
            linearDamping: 0.9,
            angularDamping: 1,
        });
        this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.25)));
        this.body.position.set(2, 2.5, 2);
        world.addBody(this.body);
        this.isGrounded = false;
        this.body.addEventListener("collide", (event) => {
            if (
                event.body === groundBody ||
                (event.body.userData && event.body.userData.isPlatform)
            ) {
                this.isGrounded = true;
            }
        });
        this.currentTarget = null;
        this.jumpAttemptsForTarget = 0;
        this.updateHealthBar();
    }

    takeDamage(amount) {
        if (!this.isAlive) return;
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            console.log("Enemy is dead!");
            this.isAlive = false;
            this.scene.remove(this.mesh);
            this.world.removeBody(this.body);
            this.removeAllProjectiles();
            // Increment the player's kill count
            player.kills++;

            // Check for win condition
            if (player.kills >= 3) {
                displayWinner("Player Wins!");
                return;
            }
            setTimeout(() => this.respawn(), 10000);
        } else {
            this.updateHealthBar();
        }
    }

    updateHealthBar() {
        const enemyHealthBar = document.getElementById("enemy-health-bar");
        if (enemyHealthBar && this.health > 0) {
            const healthPercentage = (this.health / this.maxHealth) * 100;
            enemyHealthBar.style.width = healthPercentage + "%";
            enemyHealthBar.style.background =
                healthPercentage < 30 ? "red" : "green";
        }
    }

    computeSteering(targetPos) {
        const desired = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize()
            .multiplyScalar(this.movementSpeed);
        let avoidance = new THREE.Vector3(0, 0, 0);
        const raycaster = new THREE.Raycaster();
        raycaster.set(this.mesh.position, desired.clone());
        const obstacleMeshes = platforms.map((ob) => ob.mesh);
        const intersections = raycaster.intersectObjects(obstacleMeshes);
        if (intersections.length > 0 && intersections[0].distance < 1.0) {
            const normal = intersections[0].face.normal;
            avoidance.add(normal.clone().multiplyScalar(this.movementSpeed));
        }
        const steering = desired.add(avoidance);
        return steering.normalize().multiplyScalar(this.movementSpeed);
    }

    shoot() {
        if (!this.isAlive) return;
        const direction = new THREE.Vector3()
            .subVectors(this.player.mesh.position, this.mesh.position)
            .normalize();
        const enemyProjectile = new Projectile(
            this.mesh.position.clone(),
            direction,
            ENEMY_PROJECTILE_SPEED,
            ENEMY_PROJECTILE_LIFETIME
        );
        enemyProjectile.material.color.set(0xff0000);
        this.projectiles.push(enemyProjectile);
        this.scene.add(enemyProjectile.mesh);
        this.lastShotTime = Date.now();
    }

    respawn() {
        this.health = this.maxHealth;
        this.isAlive = true;
        this.scene.add(this.mesh);
        this.world.addBody(this.body);
        const min = -5, max = 5;
        const randomX = Math.random() * (max - min) + min;
        const randomZ = Math.random() * (max - min) + min;
        this.mesh.position.set(randomX, 2.5, randomZ);
        this.body.position.set(randomX, 2.5, randomZ);
        console.log("Enemy has respawned!");
        this.updateHealthBar();
    }

    // Enemy health regeneration method
    activateHealthRegen() {
        if (this.spendCubes(10)) {
            this.health = Math.min(this.health + this.maxHealth / 2, this.maxHealth);
            this.updateHealthBar();
            console.log("Enemy Health Regenerated!");
        } else {
            console.log("Enemy does not have enough cubes to regenerate health!");
        }
    }

    // Helper method to spend cubes
    spendCubes(amount) {
        if (this.cubeCount >= amount) {
            this.cubeCount -= amount;
            return true;
        }
        return false;
    }

    update() {
        if (!this.isAlive) return;

        // Auto health regeneration check if needed.
        if (this.health < 0.2 * this.maxHealth && this.cubeCount >= 10) {
            this.activateHealthRegen();
        }

        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // ----- Target Selection & Switching -----
        // If there are collectible cubes available, always switch to targeting the nearest cube.
        if (collectibleCubes.length > 0) {
            let candidate = null;
            let minDistance = Infinity;
            for (const cubeObj of collectibleCubes) {
                const d = this.mesh.position.distanceTo(cubeObj.mesh.position);
                if (d < minDistance) {
                    minDistance = d;
                    candidate = cubeObj;
                }
            }
            // Switch to the cube target (even if currently targeting the player)
            this.currentTarget = candidate;
            this.jumpAttemptsForTarget = 0;
        } else {
            // Fallback: if no cubes exist, target the player.
            if (!this.currentTarget || this.currentTarget.mesh !== this.player.mesh) {
                this.currentTarget = { mesh: this.player.mesh };
            }
        }

        // ----- Target Steering -----
        const MIN_DISTANCE_TO_PLAYER = 2;
        if (this.currentTarget) {
            const targetPos = this.currentTarget.mesh.position;
            // If the current target is the player, enforce a minimum distance.
            if (this.currentTarget.mesh === this.player.mesh) {
                const distanceToPlayer = this.mesh.position.distanceTo(targetPos);
                if (distanceToPlayer < MIN_DISTANCE_TO_PLAYER) {
                    // Too close: steer away from the player.
                    const directionAway = this.mesh.position.clone().sub(targetPos).normalize();
                    this.body.velocity.x = directionAway.x * this.movementSpeed;
                    this.body.velocity.z = directionAway.z * this.movementSpeed;
                    this.mesh.lookAt(targetPos);
                } else {
                    // Not too close: approach the player normally.
                    const steering = this.computeSteering(targetPos);
                    this.body.velocity.x = steering.x;
                    this.body.velocity.z = steering.z;
                    this.mesh.lookAt(targetPos);
                }
            } else {
                // When targeting a collectible cube.
                const heightDiff = targetPos.y - this.mesh.position.y;
                if (heightDiff > 0.5) {
                    if (this.jumpAttemptsForTarget < 2) {
                        if (this.isGrounded) {
                            this.body.velocity.y = 8;
                            this.jumpAttemptsForTarget++;
                        }
                    } else {
                        collectibleCubes = collectibleCubes.filter(cubeObj => cubeObj !== this.currentTarget);
                        this.currentTarget = null;
                    }
                } else {
                    if (this.body.position.y > targetPos.y + 0.3) {
                        this.jumpAttemptsForTarget = 0;
                    }
                    const steering = this.computeSteering(targetPos);
                    this.body.velocity.x = steering.x;
                    this.body.velocity.z = steering.z;
                    this.mesh.lookAt(targetPos);
                    if (this.mesh.position.distanceTo(targetPos) < 0.5) {
                        // "Collect" the cube.
                        scene.remove(this.currentTarget.mesh);
                        this.currentTarget.mesh.geometry.dispose();
                        this.currentTarget.mesh.material.dispose();
                        world.removeBody(this.currentTarget.body);
                        collectibleCubes = collectibleCubes.filter(cubeObj => cubeObj !== this.currentTarget);
                        this.cubeCount++;
                        currentRoundCubeCount++;
                        document.getElementById("enemy-cubes").innerText = "Enemy Cubes: " + this.cubeCount;
                        this.currentTarget = null;
                        console.log(`Player Cubes (Round): ${currentRoundCubeCount} / ${totalCubes}`);
                        if (currentRoundCubeCount >= totalCubes) {
                            currentRoundCubeCount = 0;
                            resetPlatformsAndCubes();
                        }
                    }
                }
            }
        }

        // ----- Shooting at the Player -----
        const distanceToPlayer = this.mesh.position.distanceTo(this.player.mesh.position);
        if (
            distanceToPlayer < 5 &&
            Date.now() - this.lastShotTime > this.shootCooldown
        ) {
            this.shoot();
        }
        const playerBox = new THREE.Box3().setFromObject(this.player.mesh);
        this.projectiles.forEach((projectile, index) => {
            projectile.update();
            const projectileSphere = new THREE.Sphere(projectile.mesh.position, 0.15);
            if (projectileSphere.intersectsBox(playerBox)) {
                this.player.takeDamage(DAMAGE_AMOUNT);
                projectile.dispose();
                this.projectiles.splice(index, 1);
            }
        });
        this.projectiles = this.projectiles.filter(
            (proj) => proj.mesh.parent !== null
        );
    }

    removeAllProjectiles() {
        this.projectiles.forEach((projectile) => {
            projectile.dispose();
        });
        this.projectiles.length = 0;
    }
}

// ----- Platforms & Collectibles -----
function createPlatforms(numPlatforms) {
    platforms = [];
    for (let i = 0; i < numPlatforms; i++) {
        let validPosition = false;
        let platformPosition;
        const maxPosition = 4;
        const minY = 0.5;
        const maxY = 2;
        const minDistance = 1.5;
        let attempts = 0;
        while (!validPosition && attempts < 100) {
            platformPosition = new THREE.Vector3(
                Math.random() * (maxPosition * 2) - maxPosition,
                Math.random() * (maxY - minY) + minY,
                Math.random() * (maxPosition * 2) - maxPosition
            );
            validPosition = true;
            for (let j = 0; j < platforms.length; j++) {
                const existingPos = platforms[j].mesh.position;
                if (platformPosition.distanceTo(existingPos) < minDistance) {
                    validPosition = false;
                    break;
                }
            }
            attempts++;
        }
        const platformWidth = 1;
        const platformDepth = 1;
        const platformHeight = 0.1;
        const platformGeometry = new THREE.BoxGeometry(
            platformWidth,
            platformHeight,
            platformDepth
        );
        const platformMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.position.copy(platformPosition);
        scene.add(platform);
        const platformBody = new CANNON.Body({ mass: 0 });
        platformBody.userData = { isPlatform: true };
        platformBody.addShape(
            new CANNON.Box(
                new CANNON.Vec3(platformWidth / 2, platformHeight / 2, platformDepth / 2)
            )
        );
        platformBody.position.copy(platform.position);
        world.addBody(platformBody);
        platforms.push({ mesh: platform, body: platformBody });
        // Create a collectible cube on the platform.
        const cubeSize = 0.3;
        const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        cube.position.set(
            platform.position.x,
            platform.position.y + 0.5,
            platform.position.z
        );
        scene.add(cube);
        const cubeBody = new CANNON.Body({ mass: 1 });
        cubeBody.addShape(
            new CANNON.Box(new CANNON.Vec3(cubeSize / 2, cubeSize / 2, cubeSize / 2))
        );
        cubeBody.position.copy(cube.position);
        world.addBody(cubeBody);
        cubeBody.userData = { isCollectible: true, mesh: cube };
        collectibleCubes.push({ mesh: cube, body: cubeBody });
        cubeBody.addEventListener("collide", async (event) => {
            if (event.body === player.body && cubeBody.userData.isCollectible) {
                cubeBody.userData.isCollectible = false;
                collectibleCubes = collectibleCubes.filter(
                    (cubeObj) => cubeObj.body !== cubeBody
                );
                cubesToRemove.push(cubeBody);
                cube.geometry.dispose();
                cube.material.dispose();
                scene.remove(cube);
                player.cubeCount++;
                currentRoundCubeCount++;
                document.getElementById("player-cubes").innerText =
                    "Player Cubes: " + player.cubeCount;
                console.log(`Player Cubes (Round): ${currentRoundCubeCount} / ${totalCubes}`);
                if (currentRoundCubeCount >= totalCubes) {
                    currentRoundCubeCount = 0;
                    resetPlatformsAndCubes();
                }
            }
        });
    }
}

function removeAllPlatforms() {
    const objectsToRemove = scene.children.filter((object) => {
        return (
            object instanceof THREE.Mesh &&
            object !== ground &&
            object !== player.mesh &&
            object !== enemy.mesh
        );
    });
    objectsToRemove.forEach((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
        const bodyToRemove = world.bodies.find((body) => {
            return (
                body.userData &&
                (body.userData.isPlatform || body.userData.isCollectible)
            );
        });
        if (bodyToRemove) {
            world.removeBody(bodyToRemove);
        }
        scene.remove(object);
    });
    cubesToRemove.length = 0;
    collectibleCubes = [];
    platforms = [];
}

function resetPlatformsAndCubes() {
    totalCubes = 5;
    removeAllPlatforms();
    createPlatforms(totalCubes);
}

// ----- Instantiate Player & Enemy -----
const player = new Player(scene, world);
const enemy = new Enemy(scene, world, player);

// ----- Camera Setup -----
camera.position.set(0, 2, 5);
camera.lookAt(player.mesh.position);

// ----- Input Handling -----
const keys = {};
let isGrounded = false;
player.body.addEventListener("collide", (event) => {
    if (
        event.body === groundBody ||
        (event.body.userData && event.body.userData.isPlatform)
    ) {
        isGrounded = true;
    }
});

window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "Space" && isGrounded) {
        player.body.velocity.y = 8; // Player jump.
        isGrounded = false;
    }
    if (e.code === "ShiftRight" || e.code === "ShiftLeft") {
        player.shoot();
    }
    if (e.code === "KeyC") {
        player.activateCooldownReduction();
    }
});

window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
});

document
    .getElementById("healthRegenButton")
    .addEventListener("click", () => {
        player.activateHealthRegen();
    });

// ----- Camera Offset -----
const cameraOffset = new THREE.Vector3(0, 2, 2);
const cameraLookAtOffset = new THREE.Vector3(0, 1, 0);

// ----- Create Initial Platforms -----
createPlatforms(totalCubes);

// ----- Countdown Setup -----
// Pause game logic until the countdown finishes.
let countdownTime = 10; // countdown in seconds
let countdownActive = true;

// Create an off-screen canvas for drawing the countdown.
const countdownCanvas = document.createElement("canvas");
countdownCanvas.width = 512;
countdownCanvas.height = 512;
const countdownContext = countdownCanvas.getContext("2d");

// Create a texture from the canvas and use it on a sprite.
const countdownTexture = new THREE.CanvasTexture(countdownCanvas);
const countdownMaterial = new THREE.SpriteMaterial({
    map: countdownTexture,
    transparent: true,
});
const countdownSprite = new THREE.Sprite(countdownMaterial);
countdownSprite.scale.set(5, 5, 1);
countdownSprite.position.set(0, 2, 0);
scene.add(countdownSprite);

// Function to update the countdown canvas.
function updateCountdown() {
    countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height);
    countdownContext.font = "bold 100px Arial";
    countdownContext.fillStyle = "white";
    countdownContext.textAlign = "center";
    countdownContext.textBaseline = "middle";
    countdownContext.fillText(
        countdownTime,
        countdownCanvas.width / 2,
        countdownCanvas.height / 2
    );
    countdownTexture.needsUpdate = true;
}

updateCountdown();
const countdownInterval = setInterval(() => {
    countdownTime--;
    if (countdownTime <= 0) {
        clearInterval(countdownInterval);
        scene.remove(countdownSprite);
        countdownActive = false;
    } else {
        updateCountdown();
    }
}, 1000);

// Function to start the countdown
function startCountdown() {
    countdownTime = 10; // Set the countdown time
    countdownActive = true; // Activate the countdown

    scene.add(countdownSprite); // Ensure the countdown sprite is added to the scene
    updateCountdown(); // Draw initial countdown number

    const countdownInterval = setInterval(() => {
        countdownTime--;
        if (countdownTime <= 0) {
            clearInterval(countdownInterval);
            scene.remove(countdownSprite);
            countdownActive = false;
            player.respawn()
        } else {
            updateCountdown();
        }
    }, 1000);
}
// ----- winner screen -----
// Create a canvas for displaying the winner's message
const winnerCanvas = document.createElement("canvas");
winnerCanvas.width = 512;
winnerCanvas.height = 512;
const winnerContext = winnerCanvas.getContext("2d");

// Create a texture from the canvas and use it on a sprite.
const winnerTexture = new THREE.CanvasTexture(winnerCanvas);
const winnerMaterial = new THREE.SpriteMaterial({
    map: winnerTexture,
    transparent: true,
});
const winnerSprite = new THREE.Sprite(winnerMaterial);
winnerSprite.scale.set(5, 5, 1);
winnerSprite.position.set(0, 2, 0);
scene.add(winnerSprite);

function displayWinner(winnerText) {
    // Clear the canvas
    winnerContext.clearRect(0, 0, winnerCanvas.width, winnerCanvas.height);

    // Set font and styles
    winnerContext.font = "bold 50px Arial";
    winnerContext.fillStyle = "white";
    winnerContext.textAlign = "center";
    winnerContext.textBaseline = "middle";

    // Draw text
    winnerContext.fillText(winnerText, winnerCanvas.width / 2, winnerCanvas.height / 2);

    // Mark texture for update
    winnerTexture.needsUpdate = true;

    // Ensure the sprite is in the scene
    if (!scene.children.includes(winnerSprite)) {
        scene.add(winnerSprite);
    }

    // Optionally pause game logic
    countdownActive = true; // Prevent further game play

    // Set timeout to clear winner display after a delay
    setTimeout(() => {
        // Clear the winner message
        winnerContext.clearRect(0, 0, winnerCanvas.width, winnerCanvas.height);
        winnerTexture.needsUpdate = true;
        scene.remove(winnerSprite);

        // Here you might want to reset the game or handle the endgame logic
        resetGame();
    }, 5000);
}

function resetGame() {
    // Reset health
    player.kills = 0;
    enemy.kills = 0;
    player.health = player.maxHealth;
    enemy.health = enemy.maxHealth;
    player.isAlive = true;
    enemy.isAlive = true;

    // Handle reset of the game scene (platforms, collectibles, etc.)
    resetPlatformsAndCubes()

    // Start the countdown again
    startCountdown();

}

// ----- Animation Loop -----
function animate() {
    requestAnimationFrame(animate);
    world.step(1 / 60);

    // Remove bodies queued for removal.
    while (cubesToRemove.length) {
        const bodyToRemove = cubesToRemove.pop();
        world.removeBody(bodyToRemove);
    }

    // Update game logic only if countdown is finished.
    if (!countdownActive) {
        player.update(keys);
        enemy.update();

        // Check collisions for player's projectiles hitting the enemy.
        const enemyBox = new THREE.Box3().setFromObject(enemy.mesh);
        for (let i = player.projectiles.length - 1; i >= 0; i--) {
            const proj = player.projectiles[i];
            const projSphere = new THREE.Sphere(proj.mesh.position, 0.15);
            if (projSphere.intersectsBox(enemyBox)) {
                enemy.takeDamage(DAMAGE_AMOUNT);
                proj.dispose();
                player.projectiles.splice(i, 1);
            }
        }
    }

    camera.position.copy(player.mesh.position).add(cameraOffset);
    camera.lookAt(player.mesh.position.clone().add(cameraLookAtOffset));
    renderer.render(scene, camera);
}

animate();
