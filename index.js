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
let platforms = []; // Used for enemy obstacle avoidance
let collectibleCubes = []; // Both player and enemy use these
const cubesToRemove = [];
let collectedCubes = 0;
let totalCubes = 5;

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
        // Move the projectile; note that multiplying by a fixed time-step
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

        // Create player mesh
        this.geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        scene.add(this.mesh);

        // Create player physics body
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
        // Sync the mesh with the physics body
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // Handle movement input
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

        // Update projectiles
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

// ----- Enemy Class (with Jumping, Steering, & Robust Collision) -----
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

        // Create enemy mesh (distinct color)
        this.geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.material = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        scene.add(this.mesh);

        // Create enemy physics body
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
    }

    // Compute a steering force toward targetPos while avoiding obstacles.
    computeSteering(targetPos) {
        // "Seek" vector toward target
        const desired = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position)
            .normalize()
            .multiplyScalar(this.speed);

        // Use raycasting for obstacle detection and avoidance.
        let avoidance = new THREE.Vector3(0, 0, 0);
        const raycaster = new THREE.Raycaster();
        raycaster.set(this.mesh.position, desired.clone());
        const obstacleMeshes = platforms.map((ob) => ob.mesh);
        const intersections = raycaster.intersectObjects(obstacleMeshes);
        if (intersections.length > 0 && intersections[0].distance < 1.0) {
            // Use the face normal of the obstacle for avoidance.
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
        enemyProjectile.material.color.set(0xff0000); // Differentiate enemy shots
        this.projectiles.push(enemyProjectile);
        this.scene.add(enemyProjectile.mesh);
        this.lastShotTime = Date.now();
    }

    update() {
        // Sync enemy mesh with its physics body.
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // ----- AI MOVEMENT -----
        // Find the nearest collectible cube.
        let targetCube = null;
        let minDistance = Infinity;
        for (const cubeObj of collectibleCubes) {
            const distance = this.mesh.position.distanceTo(cubeObj.mesh.position);
            if (distance < minDistance) {
                minDistance = distance;
                targetCube = cubeObj;
            }
        }

        if (targetCube) {
            // If the cube is significantly higher than the enemy and the enemy is grounded, jump.
            const heightDiff = targetCube.mesh.position.y - this.mesh.position.y;
            if (heightDiff > 0.5 && this.isGrounded) {
                this.body.velocity.y = 8; // Adjust jump strength as needed
                this.isGrounded = false;
            }

            const steering = this.computeSteering(targetCube.mesh.position);
            this.body.velocity.x = steering.x;
            this.body.velocity.z = steering.z;
            this.mesh.lookAt(targetCube.mesh.position);

            // "Collect" the cube if close enough.
            if (this.mesh.position.distanceTo(targetCube.mesh.position) < 0.5) {
                console.log("Enemy collected a cube!");
                scene.remove(targetCube.mesh);
                targetCube.mesh.geometry.dispose();
                targetCube.mesh.material.dispose();
                world.removeBody(targetCube.body);
                collectibleCubes = collectibleCubes.filter(
                    (cubeObj) => cubeObj !== targetCube
                );
            }
        } else {
            this.body.velocity.x = 0;
            this.body.velocity.z = 0;
        }

        // ----- AI SHOOTING -----
        const distanceToPlayer = this.mesh.position.distanceTo(this.player.mesh.position);
        if (
            distanceToPlayer < 5 &&
            Date.now() - this.lastShotTime > this.shootCooldown
        ) {
            this.shoot();
        }

        // ----- Update Enemy Projectiles with Robust Collision Handling -----
        const playerBox = new THREE.Box3().setFromObject(this.player.mesh);
        this.projectiles.forEach((projectile, index) => {
            projectile.update();
            // Create a bounding sphere around the projectile.
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
function createPlatforms(numPlatforms) {
    for (let i = 0; i < numPlatforms; i++) {
        // Create a platform.
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

        const maxPosition = 4;
        const minY = 0.5;
        const maxY = 2;
        platform.position.set(
            Math.random() * (maxPosition * 2) - maxPosition,
            Math.random() * (maxY - minY) + minY,
            Math.random() * (maxPosition * 2) - maxPosition
        );
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

        // Save platform for enemy avoidance.
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
                    totalCubes = 5;
                    removeAllPlatforms();
                    createPlatforms(totalCubes);
                    collectedCubes = 0;
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
            (body) => body.userData && body.userData.mesh === object
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
        player.body.velocity.y = 8; // Jump
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
