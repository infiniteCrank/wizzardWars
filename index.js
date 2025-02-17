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
let platforms = []; // For enemy obstacle avoidance
let collectibleCubes = []; // Shared cubes for player & enemy
const cubesToRemove = [];
let collectedCubes = 0;
let totalCubes = 5; // Total cubes per round

const PROJECTILE_SPEED = 2;
const PROJECTILE_LIFETIME = 3000;
const ENEMY_PROJECTILE_SPEED = 2;
const ENEMY_PROJECTILE_LIFETIME = 3000;

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
        // Move the projectile using a fixed time-step factor.
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
        this.projectiles = [];
        this.speed = 5;
        this.scene = scene;
        this.world = world;

        // Create player mesh.
        this.geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        scene.add(this.mesh);

        // Create player physics body.
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
    }

    update(keys) {
        // Sync the mesh with the physics body.
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // Handle movement input.
        const targetVelocity = new CANNON.Vec3(0, 0, 0);
        if (keys["ArrowUp"]) targetVelocity.z = -this.speed;
        if (keys["ArrowDown"]) targetVelocity.z = this.speed;
        if (keys["ArrowLeft"]) targetVelocity.x = -this.speed;
        if (keys["ArrowRight"]) targetVelocity.x = this.speed;

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

        // Update projectiles.
        this.projectiles.forEach((projectile) => projectile.update());
        this.projectiles = this.projectiles.filter(
            (projectile) => projectile.mesh.parent !== null
        );

        this.updateHealthBar();
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        console.log(`Player Health: ${this.health}`);
        this.updateHealthBar();
        if (this.health === 0) {
            console.log("Player is dead!");
            // Add death/respawn logic here if needed.
        }
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
}

// ----- Enemy Class (with Jumping, Steering, & Two Jump Attempts) -----
class Enemy {
    constructor(scene, world, player) {
        this.scene = scene;
        this.world = world;
        this.player = player;
        this.speed = 3;
        this.projectiles = [];
        this.health = 100;
        this.shootCooldown = 2000;
        this.lastShotTime = 0;

        // Create enemy mesh (distinct color).
        this.geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.material = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        scene.add(this.mesh);

        // Create enemy physics body.
        this.body = new CANNON.Body({
            mass: 1,
            linearDamping: 0.9,
            angularDamping: 1,
        });
        this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.25)));
        this.body.position.set(2, 2.5, 2);
        world.addBody(this.body);

        // Track if the enemy is grounded to allow jumping.
        this.isGrounded = false;
        this.body.addEventListener("collide", (event) => {
            if (
                event.body === groundBody ||
                (event.body.userData && event.body.userData.isPlatform)
            ) {
                this.isGrounded = true;
            }
        });

        // For handling jump attempts on a given target cube.
        this.currentTarget = null;
        this.jumpAttemptsForTarget = 0;
    }

    // Compute a steering force toward targetPos while avoiding obstacles.
    computeSteering(targetPos) {
        // "Seek" vector toward target.
        const desired = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize()
            .multiplyScalar(this.speed);

        // Raycasting for obstacle avoidance.
        let avoidance = new THREE.Vector3(0, 0, 0);
        const raycaster = new THREE.Raycaster();
        raycaster.set(this.mesh.position, desired.clone());
        const obstacleMeshes = platforms.map((ob) => ob.mesh);
        const intersections = raycaster.intersectObjects(obstacleMeshes);
        if (intersections.length > 0 && intersections[0].distance < 1.0) {
            const normal = intersections[0].face.normal;
            avoidance.add(normal.clone().multiplyScalar(this.speed));
        }

        const steering = desired.add(avoidance);
        return steering.normalize().multiplyScalar(this.speed);
    }

    shoot() {
        const direction = new THREE.Vector3()
            .subVectors(this.player.mesh.position, this.mesh.position)
            .normalize();
        const enemyProjectile = new Projectile(
            this.mesh.position.clone(),
            direction,
            ENEMY_PROJECTILE_SPEED,
            ENEMY_PROJECTILE_LIFETIME
        );
        enemyProjectile.material.color.set(0xff0000); // Differentiate enemy shots.
        this.projectiles.push(enemyProjectile);
        this.scene.add(enemyProjectile.mesh);
        this.lastShotTime = Date.now();
    }

    update() {
        // Sync enemy mesh with its physics body.
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // ===== Select a Target Cube =====
        if (!this.currentTarget) {
            let candidate = null;
            let minDistance = Infinity;
            for (const cubeObj of collectibleCubes) {
                const dist = this.mesh.position.distanceTo(cubeObj.mesh.position);
                if (dist < minDistance) {
                    minDistance = dist;
                    candidate = cubeObj;
                }
            }
            this.currentTarget = candidate;
            this.jumpAttemptsForTarget = 0;
        }

        // ===== Process the Current Target =====
        if (this.currentTarget) {
            const targetPos = this.currentTarget.mesh.position;
            const heightDiff = targetPos.y - this.mesh.position.y;

            // If the cube is significantly higher than the enemy...
            if (heightDiff > 0.5) {
                if (this.jumpAttemptsForTarget < 2) {
                    if (this.isGrounded) {
                        // Try jumping.
                        this.body.velocity.y = 8; // Adjust jump strength as needed.
                        this.jumpAttemptsForTarget++;
                        console.log("Enemy jump attempt:", this.jumpAttemptsForTarget);
                    }
                } else {
                    // Already tried twice; abandon this target.
                    console.log("Enemy skipping unreachable cube");
                    collectibleCubes = collectibleCubes.filter(
                        (cubeObj) => cubeObj !== this.currentTarget
                    );
                    this.currentTarget = null;
                }
            } else {
                // If the enemy has gotten above the target platform, reset jumpAttempts.
                if (this.body.position.y > targetPos.y + 0.3) {
                    this.jumpAttemptsForTarget = 0;
                }
                // Compute steering toward the current target.
                const steering = this.computeSteering(targetPos);
                this.body.velocity.x = steering.x;
                this.body.velocity.z = steering.z;
                this.mesh.lookAt(targetPos);

                // If close enough, collect the cube.
                if (this.mesh.position.distanceTo(targetPos) < 0.5) {
                    console.log("Enemy collected a cube!");
                    scene.remove(this.currentTarget.mesh);
                    this.currentTarget.mesh.geometry.dispose();
                    this.currentTarget.mesh.material.dispose();
                    world.removeBody(this.currentTarget.body);
                    collectibleCubes = collectibleCubes.filter(
                        (cubeObj) => cubeObj !== this.currentTarget
                    );
                    collectedCubes++;
                    this.currentTarget = null;
                    if (collectedCubes === totalCubes) {
                        resetPlatformsAndCubes();
                    }
                }
            }
        } else {
            // No current target—stop horizontal movement.
            this.body.velocity.x = 0;
            this.body.velocity.z = 0;
        }

        // ===== AI SHOOTING =====
        const distanceToPlayer = this.mesh.position.distanceTo(this.player.mesh.position);
        if (
            distanceToPlayer < 5 &&
            Date.now() - this.lastShotTime > this.shootCooldown
        ) {
            this.shoot();
        }

        // ===== Update Enemy Projectiles with Collision Handling =====
        const playerBox = new THREE.Box3().setFromObject(this.player.mesh);
        this.projectiles.forEach((projectile, index) => {
            projectile.update();
            const projectileSphere = new THREE.Sphere(projectile.mesh.position, 0.15);
            if (projectileSphere.intersectsBox(playerBox)) {
                this.player.takeDamage(10);
                projectile.dispose();
                this.projectiles.splice(index, 1);
            }
        });
        this.projectiles = this.projectiles.filter(
            (proj) => proj.mesh.parent !== null
        );
    }
}

// ----- Platforms & Collectibles -----
// This version of createPlatforms minimizes overlap between platforms.
function createPlatforms(numPlatforms) {
    // Clear any previously stored platforms (if resetting).
    platforms = [];
    for (let i = 0; i < numPlatforms; i++) {
        let validPosition = false;
        let platformPosition;
        const maxPosition = 4;
        const minY = 0.5;
        const maxY = 2;
        const minDistance = 1.5; // Minimum distance between platform centers.
        let attempts = 0;
        while (!validPosition && attempts < 100) { // Try up to 100 times.
            platformPosition = new THREE.Vector3(
                Math.random() * (maxPosition * 2) - maxPosition,
                Math.random() * (maxY - minY) + minY,
                Math.random() * (maxPosition * 2) - maxPosition
            );
            validPosition = true;
            // Check against existing platforms.
            for (let j = 0; j < platforms.length; j++) {
                const existingPos = platforms[j].mesh.position;
                if (platformPosition.distanceTo(existingPos) < minDistance) {
                    validPosition = false;
                    break;
                }
            }
            attempts++;
        }

        // Create the platform.
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

        // Create physics body for the platform.
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

        // Create a collectible cube on top of the platform.
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

        // When the player collides with the cube.
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
                collectedCubes++;
                console.log(`Collected cubes: ${collectedCubes}`);
                if (collectedCubes === totalCubes) {
                    resetPlatformsAndCubes();
                }
            }
        });
    }
}

function removeAllPlatforms() {
    // Remove all platforms (preserving the ground, player, and enemy)
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

        const bodyToRemove = world.bodies.find(
            (body) => {
                return (body.userData && body.userData.isPlatform) || (body.userData && body.userData.isCollectible)
            }
        );
        if (bodyToRemove) {
            world.removeBody(bodyToRemove);
        }
        scene.remove(object);
    });
    cubesToRemove.length = 0;
    collectibleCubes = [];
    platforms = [];
}

// Resets platforms and cubes when all cubes have been collected.
function resetPlatformsAndCubes() {
    totalCubes = 5;
    removeAllPlatforms();
    createPlatforms(totalCubes);
    collectedCubes = 0;
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
        player.body.velocity.y = 8; // Jump for player.
        isGrounded = false;
    }
    if (e.code === "ShiftRight" || e.code === "ShiftLeft") {
        player.shoot();
    }
});

window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
});

// ----- Camera Offset -----
const cameraOffset = new THREE.Vector3(0, 2, 2);
const cameraLookAtOffset = new THREE.Vector3(0, 1, 0);

// ----- Create Initial Platforms -----
createPlatforms(totalCubes);

// ----- Animation Loop -----
function animate() {
    requestAnimationFrame(animate);

    world.step(1 / 60);

    while (cubesToRemove.length) {
        const bodyToRemove = cubesToRemove.pop();
        world.removeBody(bodyToRemove);
    }

    player.update(keys);
    enemy.update();

    camera.position.copy(player.mesh.position).add(cameraOffset);
    camera.lookAt(player.mesh.position.clone().add(cameraLookAtOffset));

    renderer.render(scene, camera);
}

animate();
