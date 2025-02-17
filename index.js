import * as THREE from "three";
import { FontLoader, TextGeometry } from "addons";

// Initialize Scene
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

// Physics world setup
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// Create ground
const groundGeometry = new THREE.PlaneGeometry(10, 10);
const groundMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Create a physics body for the ground
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Projectile Class
class Projectile {
    constructor(position, direction, speed, lifetime) {
        this.geometry = new THREE.SphereGeometry(0.1, 16, 16); // Sphere shape
        this.material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow color
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.copy(position); // Start position

        this.direction = direction.clone().normalize(); // Direction vector
        this.speed = speed; // Speed of the projectile
        this.lifetime = lifetime; // Lifetime of the projectile

        this.startTime = Date.now(); // Track the time when created
    }

    update() {
        const elapsedTime = Date.now() - this.startTime;
        if (elapsedTime > this.lifetime) {
            this.dispose(); // Remove the projectile if its lifetime is exceeded
            return;
        }
        // Move the projectile in the direction it was fired
        this.mesh.position.add(this.direction.clone().multiplyScalar(this.speed));
    }

    dispose() {
        // Clean up the projectile
        scene.remove(this.mesh);
        this.geometry.dispose();
        this.material.dispose();
    }
}

// Player Class
class Player {
    constructor(scene, world) {
        // Initialize properties
        this.health = 100; // Starting health
        this.maxHealth = 100; // Maximum health
        this.projectiles = []; // Array to hold projectiles
        this.speed = 5; // Speed of the player
        this.scene = scene; // Access to the scene
        this.world = world; // Access to the physics world

        // Create player geometry and material
        this.geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);

        // Create Cannon.js physics body for the player
        this.body = new CANNON.Body({
            mass: 1,
            linearDamping: 0.9,
            angularDamping: 1,
        });
        this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.25)));
        this.body.position.set(0, 2.5, 0);
        this.world.addBody(this.body);
    }

    // Method to shoot projectiles
    shoot() {
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.mesh.quaternion); // Apply player's rotation

        const newProjectile = new Projectile(this.mesh.position.clone(), direction, PROJECTILE_SPEED, PROJECTILE_LIFETIME);
        this.projectiles.push(newProjectile);
        this.scene.add(newProjectile.mesh); // Add the projectile to the scene
    }

    // Update method to handle player movement and projectiles
    update(keys) {
        // Sync Three.js object with physics body
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // Handle inputs for movement
        const targetVelocity = new CANNON.Vec3(0, 0, 0);
        if (keys["ArrowUp"]) {
            targetVelocity.z = -this.speed; // Move forward
        }
        if (keys["ArrowDown"]) {
            targetVelocity.z = this.speed; // Move backward
        }
        if (keys["ArrowLeft"]) {
            targetVelocity.x = -this.speed; // Move left
        }
        if (keys["ArrowRight"]) {
            targetVelocity.x = this.speed; // Move right
        }

        // Calculate direction based on input
        if (targetVelocity.x !== 0 || targetVelocity.z !== 0) {
            const direction = new THREE.Vector3(targetVelocity.x, 0, targetVelocity.z).normalize();
            this.mesh.lookAt(this.mesh.position.clone().add(direction));
        }

        // Set the player's linear velocity
        this.body.velocity.x = targetVelocity.x;
        this.body.velocity.z = targetVelocity.z;

        // Update projectiles
        this.projectiles.forEach((projectile) => {
            projectile.update();
        });

        // Clean up expired projectiles
        this.projectiles = this.projectiles.filter(projectile => projectile.mesh.position.distanceTo(this.mesh.position) < 1000);

        // Update health bar (assuming updateHealthBar is defined in the global scope)
        this.updateHealthBar();
    }

    // Health Management
    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        console.log(`Player Health: ${this.health}`);
        this.updateHealthBar();
        if (this.health === 0) {
            console.log("Player is dead!");
            // Handle death (e.g., restart, show game over, etc.)
        }
    }

    // Update the health bar in the DOM
    updateHealthBar() {
        const healthBarElement = document.getElementById("health-bar");
        const healthPercentage = (this.health / this.maxHealth) * 100; // Calculate current health percentage
        healthBarElement.style.width = healthPercentage + "%"; // Update width of the health bar
        healthBarElement.style.background = healthPercentage < 30 ? "red" : "green"; // Change color if health is low
    }
}

// Initialize the player
const player = new Player(scene, world);

// Setup for projectiles
let playerProjectiles = [];
const PROJECTILE_SPEED = 2; // Speed of the projectile
const PROJECTILE_LIFETIME = 3000; // Lifetime of the projectile in milliseconds

// Variables to track collected items
let collectedCubes = 0;
let totalCubes = 5;
const cubesToRemove = [];

// Function to create random platforms and collectable cubes
function createPlatforms(numPlatforms) {
    for (let i = 0; i < numPlatforms; i++) {
        // ****************** platform stuff ********************
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

        const platformBody = new CANNON.Body({
            mass: 0,
        });
        platformBody.userData = { isPlatform: true };
        platformBody.addShape(
            new CANNON.Box(
                new CANNON.Vec3(
                    platformWidth / 2,
                    platformHeight / 2,
                    platformDepth / 2
                )
            )
        );
        platformBody.position.copy(platform.position);
        world.addBody(platformBody);

        // Create collectable cubes
        const cubeSize = 0.3;
        const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);

        cube.position.set(
            platform.position.x,
            platform.position.y + .5,
            platform.position.z
        );

        scene.add(cube);

        const cubeBody = new CANNON.Body({
            mass: 1,
        });
        cubeBody.addShape(
            new CANNON.Box(
                new CANNON.Vec3(cubeSize / 2, cubeSize / 2, cubeSize / 2)
            )
        );
        cubeBody.position.copy(cube.position);
        world.addBody(cubeBody);

        cubeBody.userData = { isCollectible: true, mesh: cube };

        // Handle cube collision with player
        cubeBody.addEventListener("collide", async (event) => {
            if (event.body === player.body && cubeBody.userData.isCollectible) {
                cubeBody.userData.isCollectible = false;
                cubesToRemove.push(cubeBody);
                cube.geometry.dispose();
                cube.material.dispose();
                scene.remove(cube);
                collectedCubes++;
                console.log(`Collected cubes: ${collectedCubes}`);

                if (collectedCubes === totalCubes) {
                    totalCubes = 5;
                    removeAllPlatforms(); // Trigger platform removal
                    createPlatforms(totalCubes);
                    collectedCubes = 0;
                }
            }
        });
    }
}

function removeAllPlatforms() {
    // Remove all existing platforms and cubes, preserving the ground, player, and feet
    const objectsToRemove = scene.children.filter((object) => {
        return (
            object instanceof THREE.Mesh &&
            object !== ground &&
            object !== player.mesh
        );
    });

    // Clean up Three.js objects first
    objectsToRemove.forEach((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();

        // Remove any associated physics body
        const bodyToRemove = world.bodies.find(
            (body) => body.userData && body.userData.mesh === object
        );
        if (bodyToRemove) {
            world.remove(bodyToRemove); // Remove from physics world
        }

        scene.remove(object);
    });

    // Clear the cubesToRemove array to avoid referencing them later
    cubesToRemove.length = 0;
}

// Create 5 random platforms
createPlatforms(totalCubes);

// Camera positioning
camera.position.set(0, 2, 5);
camera.lookAt(player.mesh.position);

// Event listener for keyboard controls
const keys = {};
let isGrounded = false;

// Player collision detection
player.body.addEventListener("collide", (event) => {
    if (event.body === groundBody || (event.body.userData && event.body.userData.isPlatform)) {
        isGrounded = true; // Player is grounded when colliding with platforms or ground
    }
});

// Control logic
window.addEventListener("keydown", (e) => {
    keys[e.code] = true;

    // Jump when the spacebar is pressed
    if (e.code === "Space" && isGrounded) {
        player.body.velocity.y = 8; // Apply an upward force for jump
        isGrounded = false;
    }

    if (e.code === "ShiftRight" || e.code === "ShiftLeft") {
        player.shoot(); // Call the function to shoot when Enter is pressed
    }
});

window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
});

// Camera positioning constants
const cameraOffset = new THREE.Vector3(0, 2, 2); // Distance behind the player
const cameraLookAtOffset = new THREE.Vector3(0, 1, 0); // Look slightly above player's position

// Game loop
function animate() {
    requestAnimationFrame(animate);

    // Update physics world
    world.step(1 / 60);

    // Remove marked cubes from the physics world
    while (cubesToRemove.length) {
        const bodyToRemove = cubesToRemove.pop();
        world.remove(bodyToRemove); // Remove from physics world
    }

    // Update player and camera
    player.update(keys);

    // Update camera position and look at
    camera.position.copy(player.mesh.position).add(cameraOffset);
    camera.lookAt(player.mesh.position.clone().add(cameraLookAtOffset));

    // Render the scene
    renderer.render(scene, camera);
}

// Start the animation loop
animate();