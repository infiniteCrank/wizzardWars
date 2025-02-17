import * as THREE from "three";
import { OrbitControls, GLTFLoader } from "addons";

// Set up the scene
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Set up the camera position for isometric view
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

// Create a physics world
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // Apply gravity downwards

// Create a ground plane in Cannon.js
const groundBody = new CANNON.Body({
    mass: 0 // Static body
});
const groundShape = new CANNON.Plane();
groundBody.addShape(groundShape);
groundBody.position.set(0, 0, 0); // Place the ground at the origin
world.addBody(groundBody);

// Create a ground mesh in Three.js to visualize the ground
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x777777, side: THREE.DoubleSide });
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat
scene.add(groundMesh);

// Create a dynamic object (cube) in Cannon.js
const cubeSize = 1;
const cubeBody = new CANNON.Body({
    mass: 1 // Dynamic body
});
const cubeShape = new CANNON.Box(new CANNON.Vec3(cubeSize / 2, cubeSize / 2, cubeSize / 2));
cubeBody.addShape(cubeShape);
cubeBody.position.set(0, 5, 0); // Start above the ground
world.addBody(cubeBody);

// Create a Three.js cube mesh to visualize the dynamic object
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
scene.add(cubeMesh);

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Step the physics world
    world.step(1 / 60);

    // Update the position of the Three.js mesh to match the Cannon.js body
    cubeMesh.position.copy(cubeBody.position);
    cubeMesh.quaternion.copy(cubeBody.quaternion);

    // Render the scene
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -5 * aspect;
    camera.right = 5 * aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the animation loop
animate();