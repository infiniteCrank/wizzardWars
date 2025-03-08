import * as THREE from "three";
import { OrbitControls, GLTFLoader } from "addons";

// ----- Scene Setup -----
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
// Set the camera position to view the whole scene (adjusted closer)
camera.position.set(4, 4, 4);

// ----- Renderer & OrbitControls -----
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, 0, 0);
orbitControls.update();

// Create Ambient Light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Create Directional Light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);

let lastCallTime = null;
let resetCallTime = false;
const settings = {
    stepFrequency: 60,
    maxSubSteps: 3
};

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
let platforms = [];          // Each platform now stores its collectible cube
let collectibleCubes = [];   // Collectible cubes available for both player & enemy
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
        this.kills = 0;

        this.cubeCount = 0;
        this.scene = scene;
        this.world = world;
        this.isAlive = true;
        this.isGrounded = false;
        // currentTarget: object with { mesh, (optionally body), type }
        // type: "collectible", "platform", or "enemy"
        this.currentTarget = null;
        this.movementSpeed = 2;
        this.jumpAttemptsForTarget = 0;

        this.projectileUnlocked = false;
        this.lastProjectileTime = 0; // Last time a projectile was fired
        this.projectileCooldown = 1.5; // Time in seconds between shots
        this.projectiles = []; // Array to store active projectiles

        const loader = new GLTFLoader();
        loader.load("wizard.glb", (gltf) => {
            this.mesh = gltf.scene;
            this.mesh.scale.set(0.25, 0.25, 0.25);
            scene.add(this.mesh);

            this.body = new CANNON.Body({
                mass: 1,
                linearDamping: 0.9,
                angularDamping: 1,
            });
            this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.25)));
            this.body.position.set(0, 2.5, 0);
            world.addBody(this.body);

            this.body.addEventListener("collide", (event) => {
                if (
                    event.body === groundBody ||
                    (event.body.userData && event.body.userData.isPlatform)
                ) {
                    this.isGrounded = true;
                }
            });
        });
    }
    // Check if projectiles should be unlocked
    checkProjectileUnlock() {
        if (this.cubeCount >= 10 && !this.projectileUnlocked) {
            console.log("Projectiles Unlocked!");
            this.projectileUnlocked = true;
        }
    }
    // Fire a projectile at the enemy
    fireProjectile() {
        if (!this.projectileUnlocked) return; // Ensure projectiles are unlocked

        const now = performance.now() / 1000;
        if (now - this.lastProjectileTime < this.projectileCooldown) return; // Enforce cooldown

        this.lastProjectileTime = now;

        // Create the projectile
        const projectileGeometry = new THREE.SphereGeometry(0.15, 16, 16);
        const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
        scene.add(projectileMesh);

        // Set initial position at the player's current position
        projectileMesh.position.copy(this.body.position);

        // Compute direction toward enemy
        const direction = new THREE.Vector3().subVectors(enemy.mesh.position, this.body.position).normalize();
        const speed = 7; // Speed of projectile

        // Store the projectile and its velocity
        this.projectiles.push({
            mesh: projectileMesh,
            velocity: direction.multiplyScalar(speed),
        });

        console.log("Firing projectile!");
    }

    enableShooting() {
        if (this.spendCubes(10)) {
            this.shootingEnabled = true;
            console.log("Player shooting enabled!");
        } else {
            console.log("Not enough cubes to activate shooting!");
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
        if (!this.isAlive) return;
        if (!this.mesh) return;
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // Check if projectiles should be unlocked
        this.checkProjectileUnlock();

        // Auto-fire projectiles if unlocked
        if (this.projectileUnlocked) {
            this.fireProjectile();
        }

        // Move and check projectile collisions
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];

            // Move projectile forward
            proj.mesh.position.add(proj.velocity.clone().multiplyScalar(1 / 60));

            // Check collision with enemy
            const enemyBox = new THREE.Box3().setFromObject(enemy.mesh);
            const projSphere = new THREE.Sphere(proj.mesh.position, 0.15);

            if (projSphere.intersectsBox(enemyBox)) {
                // Create explosion effect when hitting enemy
                createParticleEffect(enemy.mesh.position, 0xff0000); // Red explosion effect
                enemy.takeDamage(DAMAGE_AMOUNT);
                scene.remove(proj.mesh);
                this.projectiles.splice(i, 1); // Remove from list
            }
        }

        // ---- Auto-Movement when a target is selected ----
        if (this.currentTarget) {
            const targetPos = this.currentTarget.mesh.position;
            const heightDiff = targetPos.y - this.mesh.position.y;

            if (this.currentTarget.type === "collectible" || this.currentTarget.type === "platform") {
                // Jump if the target is significantly higher
                if (heightDiff > 0.5) {
                    if (this.jumpAttemptsForTarget < 2 && this.isGrounded) {
                        this.body.velocity.y = 8; // Jump force
                        this.jumpAttemptsForTarget++;
                    }
                } else {
                    this.jumpAttemptsForTarget = 0; // Reset jump attempt when not jumping
                    const steering = this.computeSteering(targetPos);
                    this.body.velocity.x = steering.x;
                    this.body.velocity.z = steering.z;
                    this.mesh.lookAt(targetPos);
                    if (this.mesh.position.distanceTo(targetPos) < 0.5) {
                        // Collect or confirm reach.
                        // Collect or move logic here.
                    }
                }
            } else if (this.currentTarget.type === "enemy") {
                // Move towards the enemy and shoot if close enough
                const minDistance = 2;
                const currentDistance = this.mesh.position.distanceTo(targetPos);
                if (currentDistance > minDistance) {
                    const steering = this.computeSteering(targetPos);
                    this.body.velocity.x = steering.x;
                    this.body.velocity.z = steering.z;
                    this.mesh.lookAt(targetPos);
                }
            }
        }


        // ---- Manual Input Processing ----
        if (keys["KeyH"]) this.activateHealthRegen();
        if (keys["KeyC"]) this.activateCooldownReduction();
        if (keys["KeyG"]) this.enableShooting();


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
            enemy.kills++;
            document.getElementById("enemy-kills").innerText = "Enemy Kills: " + enemy.kills;
            if (enemy.kills >= 3) {
                displayWinner("Enemy wins!");
                return;
            }
            setTimeout(() => this.respawn(), 10000);
        } else {
            this.updateHealthBar();
        }
    }
    activateCooldownReduction() {
        if (this.spendCubes(10)) {
            this.shootCooldown /= 2;
            console.log("Projectile cooldown reduced!");

            // Trigger particle effect at player's position
            createParticleEffect(this.body.position, 0x00ff00); // Green particles for cooldown reduction

            setTimeout(() => {
                this.shootCooldown *= 2;
                console.log("Projectile cooldown restored!");
            }, 10000);
        } else {
            console.log("Not enough cubes to activate cooldown reduction!");
        }
    }
    removeAllProjectiles() {
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
        if (this.spendCubes(10)) {
            this.health = Math.min(this.health + this.maxHealth / 2, this.maxHealth);
            this.updateHealthBar();
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
        this.kills = 0;
        this.projectiles = [];
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
    enableShooting() {
        if (this.spendCubes(10)) {
            this.shootingEnabled = true;
            console.log("Enemy shooting enabled!");
        }
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
            player.kills++;
            document.getElementById("player-kills").innerText = "Player Kills: " + player.kills;
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
        if (!this.isAlive || !this.shootingEnabled) return;
        const direction = new THREE.Vector3()
            .subVectors(this.player.mesh.position, this.mesh.position)
            .normalize();
        const enemyProjectile = new Projectile(
            this.mesh.position.clone(),
            direction,
            ENEMY_PROJECTILE_SPEED,
            ENEMY_PROJECTILE_LIFETIME
        );
        enemyProjectile.material.color.set(0x00ff00);
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
    activateCooldownReduction() {
        if (this.health === this.maxHealth && this.spendCubes(10)) {
            this.shootCooldown /= 2;
            console.log("Enemy projectile cooldown reduced!");
            setTimeout(() => {
                this.shootCooldown *= 2;
                console.log("Enemy projectile cooldown restored!");
            }, 10000);
        } else {
            console.log("Enemy cannot activate cooldown reduction, either not at full health or not enough cubes!");
        }
    }
    activateHealthRegen() {
        if (this.spendCubes(10)) {
            this.health = Math.min(this.health + this.maxHealth / 2, this.maxHealth);
            this.updateHealthBar();
            console.log("Enemy Health Regenerated!");
        } else {
            console.log("Enemy does not have enough cubes to regenerate health!");
        }
    }
    spendCubes(amount) {
        if (this.cubeCount >= amount) {
            this.cubeCount -= amount;
            return true;
        }
        return false;
    }
    update() {
        if (!this.isAlive) return;

        if (!this.shootingEnabled && this.cubeCount >= 10) {
            this.enableShooting();
        }

        if (this.health < 0.2 * this.maxHealth && this.cubeCount >= 10) {
            this.activateHealthRegen();
        }
        if (this.health === this.maxHealth && this.cubeCount >= 10 && Math.random() < 0.01) {
            this.activateCooldownReduction();
        }

        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // ----- Target Selection & Switching -----
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
            this.currentTarget = candidate;
            this.jumpAttemptsForTarget = 0;
        } else {
            if (!this.currentTarget || this.currentTarget.mesh !== this.player.mesh) {
                this.currentTarget = { mesh: this.player.mesh };
            }
        }

        // ----- Target Steering -----
        const MIN_DISTANCE_TO_PLAYER = 2;
        if (this.currentTarget) {
            const targetPos = this.currentTarget.mesh.position;
            if (this.currentTarget.mesh === this.player.mesh) {

                const distanceToPlayer = this.mesh.position.distanceTo(targetPos);
                if (distanceToPlayer < MIN_DISTANCE_TO_PLAYER) {
                    const directionAway = this.mesh.position.clone().sub(targetPos).normalize();
                    this.body.velocity.x = directionAway.x * this.movementSpeed;
                    this.body.velocity.z = directionAway.z * this.movementSpeed;
                    this.mesh.lookAt(targetPos);
                } else {
                    const steering = this.computeSteering(targetPos);
                    this.body.velocity.x = steering.x;
                    this.body.velocity.z = steering.z;
                    this.mesh.lookAt(targetPos);
                }
            } else {
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
// Each platform now stores its collectible cube and cubes are made bigger.
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
        // Create a platform object that will store its cube
        const platformObj = { mesh: platform, body: platformBody };

        // Create a larger collectible cube on the platform.
        const cubeSize = 0.5;
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
        // Attach the cube to the platform object.
        platformObj.cube = { mesh: cube, body: cubeBody };
        platforms.push(platformObj);
        collectibleCubes.push(platformObj.cube);

        // Listen for collisions (if the player runs into the cube)
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
    console.log("Platforms and cubes have been reset.");
}

// ----- Particle effects -----
function createParticleEffect(position, color) {
    const particleCount = 20;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = position.x + (Math.random() - 0.5) * 0.5;
        positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.5;
        positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.5;
    }

    particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const particleMaterial = new THREE.PointsMaterial({
        color: color,
        size: 0.1,
        transparent: true,
        opacity: 0.8,
    });

    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);

    // Animate particles and remove after a short delay
    const duration = 0.5; // Effect lasts 0.5s
    let elapsedTime = 0;

    function animateParticles() {
        elapsedTime += 1 / 60;

        if (elapsedTime > duration) {
            scene.remove(particleSystem);
            particles.dispose();
            particleMaterial.dispose();
            return;
        }

        const positionsArray = particles.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
            positionsArray[i * 3 + 1] += 0.02; // Move particles upwards slightly
        }
        particles.attributes.position.needsUpdate = true;

        requestAnimationFrame(animateParticles);
    }

    animateParticles();
}

// ----- Instantiate Player & Enemy -----
const player = new Player(scene, world);
const enemy = new Enemy(scene, world, player);

const keys = {};

window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
});
window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
});

// ----- UI Buttons -----
document
    .getElementById("healthRegenButton")
    .addEventListener("click", () => {
        player.activateHealthRegen();
    });
document
    .getElementById("coolDownButton")
    .addEventListener("click", () => {
        player.activateCooldownReduction();
    });
document
    .getElementById("enableGun")
    .addEventListener("click", () => {
        player.enableShooting();
    });

// ----- Countdown Setup -----
let countdownTime = 3;
let countdownActive = true;
const countdownCanvas = document.createElement("canvas");
countdownCanvas.width = 512;
countdownCanvas.height = 512;
const countdownContext = countdownCanvas.getContext("2d");
const countdownTexture = new THREE.CanvasTexture(countdownCanvas);
const countdownMaterial = new THREE.SpriteMaterial({
    map: countdownTexture,
    transparent: true,
});
const countdownSprite = new THREE.Sprite(countdownMaterial);
countdownSprite.scale.set(5, 5, 1);
countdownSprite.position.set(0, 2, 0);
scene.add(countdownSprite);

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
        // Reset platforms and cubes when countdown finishes.
        resetPlatformsAndCubes();
        if (!enemy.isAlive) {
            enemy.respawn();
        }
        if (!player.isAlive) {
            player.respawn();
        }
    } else {
        updateCountdown();
    }
}, 1000);

function startCountdown() {
    countdownTime = 3;
    countdownActive = true;
    scene.add(countdownSprite);
    updateCountdown();
    const countdownInterval = setInterval(() => {
        countdownTime--;
        if (countdownTime <= 0) {
            clearInterval(countdownInterval);
            scene.remove(countdownSprite);
            countdownActive = false;
            resetPlatformsAndCubes();
            player.respawn();
        } else {
            updateCountdown();
        }
    }, 1000);
}

// ----- Winner Screen -----
const winnerCanvas = document.createElement("canvas");
winnerCanvas.width = 512;
winnerCanvas.height = 512;
const winnerContext = winnerCanvas.getContext("2d");
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
    winnerContext.clearRect(0, 0, winnerCanvas.width, winnerCanvas.height);
    winnerContext.font = "bold 50px Arial";
    winnerContext.fillStyle = "white";
    winnerContext.textAlign = "center";
    winnerContext.textBaseline = "middle";
    winnerContext.fillText(winnerText, winnerCanvas.width / 2, winnerCanvas.height / 2);
    winnerTexture.needsUpdate = true;
    if (!scene.children.includes(winnerSprite)) {
        scene.add(winnerSprite);
    }
    countdownActive = true;
    setTimeout(() => {
        winnerContext.clearRect(0, 0, winnerCanvas.width, winnerCanvas.height);
        winnerTexture.needsUpdate = true;
        scene.remove(winnerSprite);
        resetGame();
    }, 5000);
}

function resetGame() {
    player.kills = 0;
    enemy.kills = 0;
    player.health = player.maxHealth;
    enemy.health = enemy.maxHealth;
    player.isAlive = true;
    enemy.isAlive = true;
    resetPlatformsAndCubes();
    startCountdown();
}

// ----- Targeting via Pointer Events & Visual Cue -----
// Global variable for the visual cue (a yellow ring)
let targetIndicator = null;

window.addEventListener("pointerdown", onPointerDown, false);

function onPointerDown(event) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const targetableObjects = [];
    collectibleCubes.forEach(cubeObj => targetableObjects.push(cubeObj.mesh));
    platforms.forEach(platObj => targetableObjects.push(platObj.mesh));
    targetableObjects.push(enemy.mesh);

    const intersects = raycaster.intersectObjects(targetableObjects, false);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;

        if (clickedObject === enemy.mesh) {
            console.log("Enemy targeted!");
            player.currentTarget = { mesh: enemy.mesh, type: "enemy" };
        } else {
            const cubeObj = collectibleCubes.find(cubeObj => cubeObj.mesh === clickedObject);
            if (cubeObj) {
                console.log("Collectible cube targeted!");
                player.currentTarget = { ...cubeObj, type: "collectible" };
            } else {
                const platObj = platforms.find(platObj => platObj.mesh === clickedObject);
                if (platObj) {
                    console.log("Platform targeted!");

                    // Check if there's a collectible on top of the platform
                    const cubeOnPlatform = collectibleCubes.find(cubeObj => {
                        return Math.abs(cubeObj.mesh.position.x - platObj.mesh.position.x) < 1 &&
                            Math.abs(cubeObj.mesh.position.z - platObj.mesh.position.z) < 1 &&
                            cubeObj.mesh.position.y > platObj.mesh.position.y;
                    });

                    if (cubeOnPlatform) {
                        console.log("Cube on platform detected, targeting cube instead.");
                        player.currentTarget = { ...cubeOnPlatform, type: "collectible" };
                    } else {
                        // Set target above the platform to avoid getting stuck
                        const targetAbovePlatform = new THREE.Vector3(
                            platObj.mesh.position.x,
                            platObj.mesh.position.y + 1.5, // Raise target above platform
                            platObj.mesh.position.z
                        );
                        player.currentTarget = { mesh: platObj.mesh, type: "platform", position: targetAbovePlatform };
                    }
                }
            }
        }
    } else {
        player.currentTarget = null;
    }

    // Move towards the new target
    if (player.currentTarget) {
        const desiredPosition = player.currentTarget.position || player.currentTarget.mesh.position;
        const steering = player.computeSteering(desiredPosition);
        player.body.velocity.x = steering.x;
        player.body.velocity.z = steering.z;
        player.body.velocity.y = Math.max(player.body.velocity.y, 5); // Apply upward force for jumping
    }

    updateTargetIndicator();
}

// Create or update the target visual cue.
function updateTargetIndicator() {
    if (player.currentTarget) {
        if (!targetIndicator) {
            const ringGeometry = new THREE.RingGeometry(0.35, 0.4, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.7,
            });
            targetIndicator = new THREE.Mesh(ringGeometry, ringMaterial);
            targetIndicator.rotation.x = -Math.PI / 2;
            scene.add(targetIndicator);
        }
        targetIndicator.position.copy(player.currentTarget.mesh.position);
        targetIndicator.position.y += 0.05;
    } else {
        if (targetIndicator) {
            scene.remove(targetIndicator);
            targetIndicator.geometry.dispose();
            targetIndicator.material.dispose();
            targetIndicator = null;
        }
    }
}

// ----- Physics Update -----
function updatePhysics() {
    const timeStep = 1 / settings.stepFrequency;
    const now = performance.now() / 1000;
    if (!lastCallTime) {
        world.step(timeStep);
        lastCallTime = now;
        return;
    }
    let timeSinceLastCall = now - lastCallTime;
    if (resetCallTime) {
        timeSinceLastCall = 0;
        resetCallTime = false;
    }
    world.step(timeStep, timeSinceLastCall, settings.maxSubSteps);
    lastCallTime = now;
}

// ----- Animation Loop -----
function animate() {
    requestAnimationFrame(animate);
    updatePhysics();

    // Remove bodies queued for removal.
    while (cubesToRemove.length) {
        const bodyToRemove = cubesToRemove.pop();
        world.removeBody(bodyToRemove);
    }

    if (!countdownActive) {
        player.update(keys);
        enemy.update();

        const enemyBox = new THREE.Box3().setFromObject(enemy.mesh);
        for (let i = player.projectiles.length - 1; i >= 0; i--) {
            const proj = player.projectiles[i];
            const projSphere = new THREE.Sphere(proj.mesh.position, 0.15);
            if (projSphere.intersectsBox(enemyBox)) {
                enemy.takeDamage(DAMAGE_AMOUNT);
                player.projectiles.splice(i, 1);
            }
        }
    }

    updateTargetIndicator();
    orbitControls.update();
    renderer.render(scene, camera);
}

animate();
