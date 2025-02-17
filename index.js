import * as THREE from "three";
import { FontLoader, TextGeometry } from "addons";

// Scene setup
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

// Create player cube (body)
const playerGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const playerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
scene.add(player);

// Create a physics body for the player
const playerBody = new CANNON.Body({
    mass: 1,
    linearDamping: 0.9,
    angularDamping: 0.9,
});
playerBody.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.25)));
playerBody.position.set(0, 2.5, 0);
world.addBody(playerBody);

// Create feet
const footGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const footMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });

const leftFoot = new THREE.Mesh(footGeometry, footMaterial);
leftFoot.position.set(-0.3, 2, 0);
scene.add(leftFoot);

const rightFoot = new THREE.Mesh(footGeometry, footMaterial);
rightFoot.position.set(0.3, 2, 0);
scene.add(rightFoot);

// Create physics bodies for feet
const leftFootBody = new CANNON.Body({
    mass: 1,
    linearDamping: 0.9,
    angularDamping: 0.9,
});
leftFootBody.addShape(new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.1)));
leftFootBody.position.set(-0.3, 2, 0);
world.addBody(leftFootBody);

const rightFootBody = new CANNON.Body({
    mass: 1,
    linearDamping: 0.9,
    angularDamping: 0.9,
});
rightFootBody.addShape(new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.1)));
rightFootBody.position.set(0.3, 2, 0);
world.addBody(rightFootBody);


// Variables to track collected items
let collectedCubes = 0;
let totalCubes = 5
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
        // ****************** END platform stuff begin cube stuff ********************

        const cubeSize = 0.3;
        const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);

        cube.position.set(
            platform.position.x,
            platform.position.y + platformHeight / 2 + cubeSize / 2,
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

        // handle cube collision with player
        cubeBody.addEventListener("collide", async (event) => {
            if (event.body === playerBody && cubeBody.userData.isCollectible) {

                cubeBody.userData.isCollectible = false;
                cubesToRemove.push(cubeBody);
                cube.geometry.dispose();
                cube.material.dispose();
                scene.remove(cube);
                collectedCubes++;
                console.log(`Collected cubes: ${collectedCubes}`);


                if (collectedCubes === totalCubes) {
                    totalCubes = 5
                    removeAllPlatforms(); // Trigger platform removal
                    createPlatforms(totalCubes);
                    collectedCubes = 0;
                }
            }
        });

    }

}

// Optimize the removal of all platforms from the game
function removeAllPlatforms() {
    // Remove all existing platforms and cubes, preserving the ground, player, and feet
    const objectsToRemove = scene.children.filter((object) => {
        return (
            object instanceof THREE.Mesh &&
            object !== ground &&
            object !== leftFoot &&
            object !== rightFoot &&
            object !== player
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
camera.lookAt(player.position);

// Event listener for keyboard controls
const keys = {};
let isGrounded = false;

// Player collision detection
playerBody.addEventListener("collide", (event) => {
    // Check if the collided object is the ground or a platform
    if (event.body === groundBody || (event.body.userData && event.body.userData.isPlatform)) {
        isGrounded = true; // Player is grounded when colliding with platforms or ground
        console.log(isGrounded)
    }
});


// Control logic
window.addEventListener("keydown", (e) => {
    keys[e.code] = true;

    // Jump when the spacebar is pressed
    if (e.code === "Space" && isGrounded) {
        playerBody.velocity.y = 5; // Apply an upward force for jump
        isGrounded = false;
        console.log(isGrounded)
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

    // Sync Three.js objects with Cannon.js bodies
    player.position.copy(playerBody.position);
    player.quaternion.copy(playerBody.quaternion);

    // Sync feet positions with the player
    leftFoot.position.set(
        player.position.x - 0.3,
        player.position.y,
        player.position.z
    );
    rightFoot.position.set(
        player.position.x + 0.3,
        player.position.y,
        player.position.z
    );

    // Basic animation: "bouncing" effect on movement
    const scaleFactor = 0.1; // Adjust this value for bounce strength
    if (
        keys["ArrowUp"] ||
        keys["ArrowDown"] ||
        keys["ArrowLeft"] ||
        keys["ArrowRight"]
    ) {
        player.scale.y = 1 + Math.sin(Date.now() * 0.005) * scaleFactor; // Bounce while moving
    } else {
        player.scale.y = 1; // Reset scale when not moving
    }

    // Calculate camera position and rotation
    camera.position.copy(player.position).add(cameraOffset);
    camera.lookAt(player.position.clone().add(cameraLookAtOffset));

    // Set the linear velocity directly to control player movement
    const targetVelocity = new CANNON.Vec3(0, 0, 0);
    if (keys["ArrowUp"]) {
        targetVelocity.z = -5; // Move forward
    }
    if (keys["ArrowDown"]) {
        targetVelocity.z = 5; // Move backward
    }
    if (keys["ArrowLeft"]) {
        targetVelocity.x = -5; // Move left
    }
    if (keys["ArrowRight"]) {
        targetVelocity.x = 5; // Move right
    }

    // Calculate direction
    if (targetVelocity.x !== 0 || targetVelocity.z !== 0) {
        const direction = new THREE.Vector3(targetVelocity.x, 0, targetVelocity.z).normalize();
        player.lookAt(player.position.clone().add(direction)); // Make the player face the direction of movement
    }

    // Set the player's linear velocity
    playerBody.velocity.x = targetVelocity.x;
    playerBody.velocity.z = targetVelocity.z;

    // Disable rotation
    playerBody.angularVelocity.set(0, 0, 0);
    playerBody.quaternion.set(0, 0, 0, 1); // Keep the player upright

    // Render the scene
    renderer.render(scene, camera);
}

// Start the animation loop
animate();
