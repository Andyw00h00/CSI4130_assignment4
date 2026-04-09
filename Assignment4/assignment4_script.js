/*  CSI4130 Assignment 4
    File: assignment4_script.js
    Students:   Andrew Guerette (300287614)
                Yier Wang       (300191294)
*/
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
let scene;
let physicsWorld;
let AmmoLib;
let lastTime = performance.now();
let controls;
let sphereMeshes = [];
let floorMesh;
let floorColliderMesh;
let floorMinX, floorMaxX;
let leftWallMesh;
let rightWallMesh;
let camera;
let keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    up: false,
    down: false,
    e: false
};
let ballThrown = false;
const MOVEMENTSPEED = 12;
// Global variables related to enemy games
let enemies = []; // Only snowmen now
let health = 100; // Player's initial health
let coin = 0; // Coins obtained by killing enemies (kept as requested)
let startButton;
let statusDisplay;
let hitCooldown = 0; // Health drain cooldown, prevents continuous health drain
let gameStarted = false;
let gameOver = false; // Is the game over
let spiderGenerated = false; // Whether the spider has been generated after all snowmen are killed
let shopTriggered = false; // Whether the shop dialog has been triggered
let shopMesh = null; // Reference to the shop mesh for collision detection

// Wall positions (fixed, since walls are parallel to Z axis)
const LEFT_WALL_X = -36;
const RIGHT_WALL_X = 16;
const BEAVER_TAIL_PRICE = 10; // Price per beaver tail, 10 coins each
const MIN_TREE_SPACING = 1; // Minimum spacing between trees, 1 meter
const MAX_TREE_SPACING = 100; // Maximum spacing between trees, 10 meters
const TREE_SCALE = 0.5; // Scale of the tree model, adjust to fit the scene

function initPhysicsWorld() {
    const config = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(config);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld(
        dispatcher,
        broadphase,
        solver,
        config
    );
    physicsWorld.setGravity(new Ammo.btVector3(0, -39.2, 0));
}
// General function for creating rigid bodies
function createBoxRigidBody(mesh, size, mass, restitution, customPosition = null) {
    const shape = new Ammo.btBoxShape(new Ammo.btVector3(size.x/2, size.y/2, size.z/2));
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    const pos = customPosition || mesh.position;
    transform.setOrigin(new Ammo.btVector3(
        pos.x,
        pos.y,
        pos.z
    ));
    transform.setRotation(new Ammo.btQuaternion(
        mesh.quaternion.x,
        mesh.quaternion.y,
        mesh.quaternion.z,
        mesh.quaternion.w
    ));
    const motionState = new Ammo.btDefaultMotionState(transform);
    const localInertia = new Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(
        mass,
        motionState,
        shape,
        localInertia
    );
    const body = new Ammo.btRigidBody(rbInfo);
    body.setRestitution(restitution);
    physicsWorld.addRigidBody(body);
    mesh.userData.physicsBody = body;
}
// Create a spherical rigid body
function createSphereRigidBody(mesh, radius, mass, restitution) {
    const shape = new Ammo.btSphereShape(radius);
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(
        mesh.position.x,
        mesh.position.y,
        mesh.position.z
    ));
    const motionState = new Ammo.btDefaultMotionState(transform);
    const localInertia = new Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(
        mass,
        motionState,
        shape,
        localInertia
    );
    const body = new Ammo.btRigidBody(rbInfo);
    body.setRestitution(restitution);
    physicsWorld.addRigidBody(body);
    mesh.userData.physicsBody = body;
}
// Throw a snowball
function throwBall() {
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8
    });
    const ball = new THREE.Mesh(geometry, material);
    // Enable shadow for the ball
    ball.castShadow = true;
    ball.receiveShadow = true;
    ball.position.copy(camera.position);
    scene.add(ball);
    
    // Create a rigid body for the sphere
    createSphereRigidBody(ball, 0.2, 0.1, 0.5);
    
    // Give the ball an initial speed, directed towards the player's view
    const direction = new THREE.Vector3(0, 0.2, -1);
    direction.applyQuaternion(camera.quaternion);
    const body = ball.userData.physicsBody;
    body.setLinearVelocity(new Ammo.btVector3(
        direction.x * 40,
        direction.y * 40,
        direction.z * 40
    ));
    
    sphereMeshes.push(ball);
}
// Destroy the ball
function destroyBall(ball) {
    physicsWorld.removeRigidBody(ball.userData.physicsBody);
    Ammo.destroy(ball.userData.physicsBody.getMotionState());
    Ammo.destroy(ball.userData.physicsBody);
    scene.remove(ball);
    const index = sphereMeshes.indexOf(ball);
    if(index > -1) {
        sphereMeshes.splice(index, 1);
    }
}
// Trigger the shop dialog
function triggerShopDialog() {
    if(shopTriggered) return;
    shopTriggered = true;
    // Unlock the mouse so user can input
    controls.unlock();
    
    // Calculate maximum possible order based on coins
    const maxPossible = Math.min(10, Math.floor(coin / BEAVER_TAIL_PRICE));
    
    // Create the dialog panel
    const dialogPanel = document.createElement('div');
    dialogPanel.style.position = 'absolute';
    dialogPanel.style.top = '50%';
    dialogPanel.style.left = '50%';
    dialogPanel.style.transform = 'translate(-50%, -50%)';
    dialogPanel.style.padding = '30px';
    dialogPanel.style.backgroundColor = 'rgba(0,0,0,0.8)';
    dialogPanel.style.color = 'white';
    dialogPanel.style.borderRadius = '10px';
    dialogPanel.style.zIndex = '200';
    dialogPanel.innerHTML = `
        <h2>Congratulations! You have completed the game!</h2>
        <p>Beaver tails cost ${BEAVER_TAIL_PRICE} coins each. How many would you like to order?</p>
        <input type="number" id="beaverTailInput" min="1" max="${maxPossible}" value="1" style="width: 100%; padding: 8px; margin: 10px 0;">
        <button id="confirmBtn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; width: 100%;">Confirm Order</button>
    `;
    document.body.appendChild(dialogPanel);
    
    // Bind confirm button
    document.getElementById('confirmBtn').addEventListener('click', function() {
        const input = document.getElementById('beaverTailInput');
        const inputAmount = parseInt(input.value);
        // Calculate actual amount the player can afford
        const actualAmount = Math.min(inputAmount, maxPossible);
        
        // Deduct coins
        coin -= actualAmount * BEAVER_TAIL_PRICE;
        // Update status display
        statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
        
        // Show message based on whether they could afford the full order
        if(inputAmount > maxPossible) {
            // Not enough coins, show the limit message
            dialogPanel.innerHTML = `
                <h2>Thank you!</h2>
                <p>Your coins can only buy ${actualAmount} beaver tail(s). They are ready! Enjoy!</p>
                <button id="closeBtn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; width: 100%;">Close</button>
            `;
        } else {
            // Enough coins, normal message
            dialogPanel.innerHTML = `
                <h2>Thank you!</h2>
                <p>Your order of ${actualAmount} beaver tail(s) is ready! Enjoy!</p>
                <button id="closeBtn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; width: 100%;">Close</button>
            `;
        }
        
        // Bind close button
        document.getElementById('closeBtn').addEventListener('click', function() {
            document.body.removeChild(dialogPanel);
            // Re-lock the mouse if user wants to continue playing
            if(gameStarted && !gameOver) {
                controls.lock();
            }
        });
    });
}
// Game over
function endGame() {
    gameOver = true;
    const gameOverPanel = document.createElement('div');
    gameOverPanel.style.position = 'absolute';
    gameOverPanel.style.top = '50%';
    gameOverPanel.style.left = '50%';
    gameOverPanel.style.transform = 'translate(-50%, -50%)';
    gameOverPanel.style.padding = '30px';
    gameOverPanel.style.backgroundColor = 'rgba(0,0,0,0.8)';
    gameOverPanel.style.color = 'white';
    gameOverPanel.style.borderRadius = '10px';
    gameOverPanel.style.zIndex = '200';
    gameOverPanel.innerHTML = `
        <h2>Game Over!</h2>
        <p>You got ${coin} Coins in total</p>
        <button id="gameOverRestartBtn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; width: 100%;">Restart</button>
    `;
    document.body.appendChild(gameOverPanel);
    
    // Bind the restart button
    document.getElementById('gameOverRestartBtn').addEventListener('click', function() {
        // Remove game over panel
        document.body.removeChild(gameOverPanel);
        // Remove all enemies
        for(let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            if(enemy.userData.physicsBody) {
                physicsWorld.removeRigidBody(enemy.userData.physicsBody);
                Ammo.destroy(enemy.userData.physicsBody.getMotionState());
                Ammo.destroy(enemy.userData.physicsBody);
            }
            scene.remove(enemy);
        }
        enemies = [];
        // Reset all states
        health = 100;
        coin = 0;
        gameOver = false;
        gameStarted = false;
        hitCooldown = 0;
        spiderGenerated = false; // Reset spider generation flag
        shopTriggered = false; // Reset shop trigger flag
        shopMesh = null; // Reset shop mesh reference
        // Update Status
        statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
        // Show start button
        startButton.style.display = 'block';
    });
}
// Generate snowmen enemies
function generateNewEnemies() {
    // Clear all previous old enemies
    for(let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if(enemy.userData.physicsBody) {
            physicsWorld.removeRigidBody(enemy.userData.physicsBody);
            Ammo.destroy(enemy.userData.physicsBody.getMotionState());
            Ammo.destroy(enemy.userData.physicsBody);
        }
        scene.remove(enemy);
    }
    enemies = [];
    
    const loader = new GLTFLoader();
    // Only snowmen now
    const modelPath = 'textures/SnowmanFixed.glb';
    const baseScale = 1;
    
    loader.load(modelPath, function(gltf) {
        const baseEnemy = gltf.scene;
        baseEnemy.scale.set(baseScale, baseScale, baseScale);
        // 10 snowmen, randomly distributed
        const enemyCount = 10;
        // Calculate the size of the snowman
        const baseBox = new THREE.Box3().setFromObject(baseEnemy);
        const enemyWidth = baseBox.max.x - baseBox.min.x;
        // Restrict the snowman from generating on the ice area between the snow piles on both sides
        const snowBankBetweenMinX = -23; // The right boundary of the snow pile on the left
        const snowBankBetweenMaxX = 3; // The left boundary of the snow pile on the right
        // Calculate the effective range of the snowman's center
        const minEnemyX = snowBankBetweenMinX + enemyWidth / 2;
        const maxEnemyX = snowBankBetweenMaxX - enemyWidth / 2;
        
        // Player's initial position
        const playerStartPos = new THREE.Vector3(0, 0, 0);
        
        for(let i = 0; i < enemyCount; i++) {
            // Random Position
            const x = minEnemyX + Math.random() * (maxEnemyX - minEnemyX);
            const z = 50 + Math.random() * 200; // 50 to 250, far enough from the player, not too close
            
            // Clone the model to avoid loading it repeatedly
            const enemy = baseEnemy.clone();
            enemy.position.set(x, 0, z);
            
            // Make the snowman face the player
            const dx = playerStartPos.x - x;
            const dz = playerStartPos.z - z;
            enemy.rotation.y = Math.atan2(dx, dz);
            
            // Enable shadow support for the enemy, all meshes
            enemy.traverse(function(child) {
                if(child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(enemy);
            // Update the model's world matrix
            enemy.updateMatrixWorld(true);
            // Calculate the enemy's bounding box and create the corresponding collider
            const box = new THREE.Box3().setFromObject(enemy);
            const size = new THREE.Vector3(
                box.max.x - box.min.x,
                box.max.y - box.min.y,
                box.max.z - box.min.z
            );
            // Calculate the center of the model's bounding box
            const boxCenter = box.getCenter(new THREE.Vector3());
            // Create dynamic rigid body make sure aligning
            createBoxRigidBody(
                enemy,
                size,
                1,
                1.0,
                boxCenter
            );
            // Save enemies to an array for collision detection
            enemies.push(enemy);
        }
        gameStarted = true;
    });
}
// Start Game
function startGame() {
    // Hide Start button
    startButton.style.display = 'none';
    // Generate new enemies
    generateNewEnemies();
}
// Snow system
function createSnowParticles() {
    const particleCount = 1500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    
    for(let i = 0; i < particleCount; i++) {
        positions[i*3] = (Math.random() - 0.5) * 60;
        positions[i*3+1] = Math.random() * 50;
        positions[i*3+2] = Math.random() * 500;
        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * 0.02,
            -0.05 - Math.random() * 0.05,
            0
        ));
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.2,
        transparent: true,
        opacity: 0.8
    });
    const snow = new THREE.Points(geometry, material);
    scene.add(snow);
    
    // Snow animation
    function animateSnow() {
        const pos = snow.geometry.attributes.position.array;
        for(let i = 0; i < particleCount; i++) {
            pos[i*3] += velocities[i].x;
            pos[i*3+1] += velocities[i].y;
            pos[i*3+2] += velocities[i].z;
            
            // Snow falls in a loop
            if(pos[i*3+1] < 0) {
                pos[i*3+1] = 50;
                pos[i*3] = (Math.random() - 0.5) * 60;
            }
        }
        snow.geometry.attributes.position.needsUpdate = true;
        requestAnimationFrame(animateSnow);
    }
    animateSnow();
}
// initialization of Three.js
async function init() {
	// add rendering surface and initialize the renderer
    var container = document.createElement( 'div' );
    document.body.appendChild( container );
	const renderer = new THREE.WebGLRenderer();
    renderer.setClearColor(new THREE.Color(0xffffff));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows for better look
    container.appendChild(renderer.domElement);
	
    // Scene graph
    scene = new THREE.Scene();
    scene.background = new THREE.Color("lightblue");
    AmmoLib = await Ammo();
    initPhysicsWorld();
    // Replace the original white ground with the canal ice surface
    const loader = new GLTFLoader();
    loader.load('textures/Canaltexture.glb', function(gltf) {
        floorMesh = gltf.scene;
        floorMesh.position.set(0, 3, 300);
        floorMesh.rotation.y = Math.PI / 2;
        // Enable shadow for all meshes in the floor model
        floorMesh.traverse(function(child) {
            if(child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(floorMesh);
        let canalBBox = new THREE.Box3().setFromObject(floorMesh);
        const size = new THREE.Vector3();
        canalBBox.getSize(size);
        // x boundary of the ice surface
        floorMinX = canalBBox.min.x;
        floorMaxX = canalBBox.max.x;
        floorColliderMesh = new THREE.Mesh(
            new THREE.BoxGeometry(size.x, size.y, size.z),
            new THREE.MeshBasicMaterial({visible: false})
        );
        floorColliderMesh.position.set(-10, -1.5, 300);
        scene.add(floorColliderMesh);
        createBoxRigidBody(floorColliderMesh, size, 0, 0.05);
    });
    
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('textures/ConcreteWall2.jpg');
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(125, 1);
    const wallMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0.0
    });
    const wallHeight = 4;
    leftWallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(3, wallHeight, 500),
        wallMaterial
    );
    leftWallMesh.position.set(LEFT_WALL_X, 0, 250);
    // Enable shadow for the wall
    leftWallMesh.castShadow = true;
    leftWallMesh.receiveShadow = true;
    leftWallMesh.material.roughness = 0.8;
    scene.add(leftWallMesh);
    createBoxRigidBody(
        leftWallMesh, 
        new THREE.Vector3(3.5, wallHeight, 500),
        0,
        1.0
    );
    rightWallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(3, wallHeight, 500),
        wallMaterial
    );
    rightWallMesh.position.set(RIGHT_WALL_X, 0, 250);
    // Enable shadow for the wall
    rightWallMesh.castShadow = true;
    rightWallMesh.receiveShadow = true;
    rightWallMesh.material.roughness = 0.8;
    scene.add(rightWallMesh);
    createBoxRigidBody(
        rightWallMesh, 
        new THREE.Vector3(3.5, wallHeight, 500),
        0,
        1.0
    );
    
    // Load and generate pear trees on both sides of the walls
    loader.load('textures/pear_tree_mesh_photoscan.glb', function(gltf) {
        const baseTree = gltf.scene;
        baseTree.scale.set(TREE_SCALE, TREE_SCALE, TREE_SCALE);
        
        // Generate trees along the left wall (outside the wall)
        const leftTreeX = LEFT_WALL_X - 2; // 2 meters to the left of the left wall, outside
        let z = 0;
        while(z < 500) {
            const tree = baseTree.clone();
            tree.position.set(leftTreeX, 0, z);
            // Enable shadow for all meshes in the tree
            tree.traverse(function(child) {
                if(child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(tree);
            // Random spacing between 1 and 10 meters
            const spacing = MIN_TREE_SPACING + Math.random() * (MAX_TREE_SPACING - MIN_TREE_SPACING);
            z += spacing;
        }
        
        // Generate trees along the right wall (outside the wall)
        const rightTreeX = RIGHT_WALL_X + 2; // 2 meters to the right of the right wall, outside
        z = 0;
        while(z < 500) {
            const tree = baseTree.clone();
            tree.position.set(rightTreeX, 0, z);
            // Enable shadow for all meshes in the tree
            tree.traverse(function(child) {
                if(child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(tree);
            // Random spacing between 1 and 10 meters
            const spacing = MIN_TREE_SPACING + Math.random() * (MAX_TREE_SPACING - MIN_TREE_SPACING);
            z += spacing;
        }
    });
    
	// Camera
	// calcaulate aspectRatio
	var aspectRatio = window.innerWidth/window.innerHeight;
	camera = new THREE.PerspectiveCamera(45, aspectRatio, 0.1, 5000);
    // position the camera back and point to the center of the scene
    camera.position.set(0, 10, 10);
    camera.lookAt(0,0,100);
    createSphereRigidBody(camera, 0.1, 1, 0.0);
    
    // Add light to the scene
    const light = new THREE.DirectionalLight(0x88ccff, 3); // Cool-toned light
    light.castShadow = true;
    light.shadow.camera.left = -50; // Expanded shadow camera range to cover more area
    light.shadow.camera.right = 50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    light.shadow.mapSize.width = 2048; // Higher resolution for sharper shadows
    light.shadow.mapSize.height = 2048;
    light.position.set(20, 30, 20);
    light.target.position.set(0, 0, 100);
    scene.add(light.target);
    scene.add(light);
    
    const ambient = new THREE.AmbientLight(0x88ccff, 0.5); // cool-toned ambient light
    scene.add(ambient);
    
    const hemi = new THREE.HemisphereLight(0x88ccff, 0x444444, 0.4); // Cool-toned hemispherical light
    scene.add(hemi);
    
    // Removed debug helpers: CameraHelper and AxesHelper
    
    controls = new PointerLockControls(camera, document.body);
    
    // Create Start Button
    startButton = document.createElement('button');
    startButton.style.position = 'absolute';
    startButton.style.top = '50%';
    startButton.style.left = '50%';
    startButton.style.transform = 'translate(-50%, -50%)';
    startButton.style.padding = '20px 40px';
    startButton.style.fontSize = '24px';
    startButton.style.cursor = 'pointer';
    startButton.style.zIndex = '100';
    startButton.textContent = 'Start Game';
    startButton.addEventListener('click', function() {
        controls.lock();
        startGame();
    });
    document.body.appendChild(startButton);
    
    // Create status display
    statusDisplay = document.createElement('div');
    statusDisplay.style.position = 'absolute';
    statusDisplay.style.top = '10px';
    statusDisplay.style.left = '10px';
    statusDisplay.style.color = 'white';
    statusDisplay.style.fontSize = '18px';
    statusDisplay.style.zIndex = '100';
    statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
    document.body.appendChild(statusDisplay);
    
    // Keyboard Listener
    document.addEventListener('keydown', function(event) {
        switch(event.code) {
            case 'KeyW': keys.w = true; break;
            case 'KeyA': keys.a = true; break;
            case 'KeyS': keys.s = true; break;
            case 'KeyD': keys.d = true; break;
            case 'Space': keys.up = true; break;
            case 'KeyE': keys.e = true; break;
        }
    });
    document.addEventListener('keyup', function(event) {
        switch(event.code) {
            case 'KeyW': keys.w = false; break;
            case 'KeyA': keys.a = false; break;
            case 'KeyS': keys.s = false; break;
            case 'KeyD': keys.d = false; break;
            case 'Space': keys.up = false; break;
            case 'KeyE': keys.e = false; ballThrown = false; break;
        }
    });
    
    // Mouse Lock Listener
    controls.addEventListener('lock', function() {
        if(gameStarted) {
            controls.lock();
        }
    });
    controls.addEventListener('unlock', function() {
        // Unlock the mouse
    });
    
    // Create snow particles
    createSnowParticles();
    
    // render the scene
    renderer.render(scene, camera);
    render();
    
    function render() {
		requestAnimationFrame(render);
        let currentTime = performance.now();
        let dt = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        physicsWorld.stepSimulation(dt, 10);
        let cameraBody = camera.userData.physicsBody;
        let floorBody = floorColliderMesh.userData.physicsBody;
        let vy = cameraBody.getLinearVelocity().y();
        let direction = new THREE.Vector3(0, 0, 0);
        
        //check collision between camera and ground
        let dispatcher = physicsWorld.getDispatcher();
        let numManifolds = dispatcher.getNumManifolds();
        let cameraOnFloor = false;
        let floorPointer = AmmoLib.getPointer(floorBody);
        let cameraPointer = AmmoLib.getPointer(cameraBody);
        
        for (let i = 0; i < numManifolds; i++) {
            const manifold = dispatcher.getManifoldByIndexInternal(i);
            const bodyA = manifold.getBody0();
            const bodyB = manifold.getBody1();
            let bodyAPointer = AmmoLib.getPointer(bodyA);
            let bodyBPointer = AmmoLib.getPointer(bodyB);
    
            if ((bodyAPointer === floorPointer && bodyBPointer === cameraPointer) ||
                (bodyAPointer === cameraPointer && bodyBPointer === floorPointer)) {
                if (manifold.getNumContacts() > 0) {
                    cameraOnFloor = true;
                }
            }
    
            // Handling the collision of small balls
            for(let j = 0; j < sphereMeshes.length; j++) {
                let ball = sphereMeshes[j];
                let ballBody = ball.userData.physicsBody;
                let ballPointer = AmmoLib.getPointer(ballBody);
                if(bodyAPointer !== cameraPointer && bodyBPointer !== cameraPointer &&
                    (bodyAPointer === ballPointer || bodyBPointer === ballPointer)) {
                    if (manifold.getNumContacts() > 0) {
                        // Check if it hit the shop
                        let hitShop = false;
                        if(shopMesh && !shopTriggered) {
                            // Check if the other body is the shop
                            for(let k = 0; k < shopMesh.children.length; k++) {
                                let child = shopMesh.children[k];
                                if(child.userData.physicsBody) {
                                    let shopPointer = AmmoLib.getPointer(child.userData.physicsBody);
                                    if(
                                        (bodyAPointer === shopPointer && bodyBPointer === ballPointer) ||
                                        (bodyBPointer === shopPointer && bodyAPointer === ballPointer)
                                    ) {
                                        hitShop = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if(hitShop) {
                            // Trigger the shop dialog
                            triggerShopDialog();
                        }
                        
                        // Check if it hit the snowman
                        let hitEnemy = false;
                        for(let k = 0; k < enemies.length; k++) {
                            let enemy = enemies[k];
                            if(enemy.userData.physicsBody) {
                                let enemyPointer = AmmoLib.getPointer(enemy.userData.physicsBody);
                                // collision between the ball and the enemy
                                if(
                                    (bodyAPointer === enemyPointer && bodyBPointer === ballPointer) ||
                                    (bodyBPointer === enemyPointer && bodyAPointer === ballPointer)
                                ) {
                                    // Hit the snowman to get Coins (kept as requested)
                                    coin += 10;
                                    statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
                                    // Remove the snowman
                                    physicsWorld.removeRigidBody(enemy.userData.physicsBody);
                                    Ammo.destroy(enemy.userData.physicsBody.getMotionState());
                                    Ammo.destroy(enemy.userData.physicsBody);
                                    scene.remove(enemy);
                                    enemies.splice(k, 1);
                                    hitEnemy = true;
                                    break;
                                }
                            }
                        }
                        
                        // No matter what it hit, create the particle effect and destroy the ball
                        // Create a snowball explosion light effect
                        const particleCount = 10;
                        const positions = new Float32Array(particleCount * 3);
                        const velocities = [];
                        for(let l = 0; l < particleCount; l++) {
                            positions[l*3] = ball.position.x;
                            positions[l*3+1] = ball.position.y;
                            positions[l*3+2] = ball.position.z;
                            velocities.push(new THREE.Vector3(
                                (Math.random() - 0.5) * 0.2,
                                Math.random() * 0.2,
                                (Math.random() - 0.5) * 0.2
                            ));
                        }
                        const geometry = new THREE.BufferGeometry();
                        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                        const material = new THREE.PointsMaterial({color: 0xffffff, size: 0.2});
                        const particles = new THREE.Points(geometry, material);
                        scene.add(particles);
                        // Particle animation, slowly disappearing
                        let life = 30;
                        function animateParticles() {
                            life--;
                            if(life <= 0) {
                                scene.remove(particles);
                                return;
                            }
                            const pos = particles.geometry.attributes.position.array;
                            for(let l = 0; l < particleCount; l++) {
                                pos[l*3] += velocities[l].x;
                                pos[l*3+1] += velocities[l].y;
                                pos[l*3+2] += velocities[l].z;
                                velocities[l].y -= 0.01; // Gravity effect
                            }
                            particles.geometry.attributes.position.needsUpdate = true;
                            requestAnimationFrame(animateParticles);
                        }
                        animateParticles();
                        
                        // Destroy the ball
                        destroyBall(ball);
                    }
                }
            }
            if(cameraOnFloor) {
                //break; // Early exit if all contact points found
            }
        }
        
        if(keys.w) {
            direction.z = -1;
        }
        if(keys.a) {
            direction.x = -1;
        }
        if(keys.s) {
            direction.z = 1;
        }
        if(keys.d) {
            direction.x = 1;
        }
        if(keys.up && cameraOnFloor) {
            vy = 12;
        }
        if(keys.e && !ballThrown) {
            throwBall();
            ballThrown = true;
        }
        
        let quat = camera.quaternion;
        direction.applyQuaternion(quat);
        direction.multiplyScalar(MOVEMENTSPEED);
        direction.y = vy;
        cameraBody.activate(true);
        cameraBody.setLinearVelocity(new AmmoLib.btVector3(direction.x, direction.y, direction.z));
        
        scene.traverse(obj => {
            if (obj.userData.physicsBody) {
                const body = obj.userData.physicsBody;
                const motionState = body.getMotionState();
                if (motionState) {
                    const transform = new AmmoLib.btTransform();
                    motionState.getWorldTransform(transform);
                    const origin = transform.getOrigin();
                    const rotation = transform.getRotation();
                    obj.position.set(origin.x(), origin.y(), origin.z());
                    obj.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
                    Ammo.destroy(origin);
                    Ammo.destroy(rotation);
                    Ammo.destroy(transform);
                }
            }
        });
        
        let body = camera.userData.physicsBody;
        let motion = body.getMotionState();
        if(motion) {
            const transform = new AmmoLib.btTransform();
            motion.getWorldTransform(transform);
            let origin = transform.getOrigin();
            camera.position.set(origin.x(), origin.y() + 1, origin.z());
            Ammo.destroy(origin);
            Ammo.destroy(transform);
        }
        
        // Check game status
        if(gameOver) return; // Game over, pause all logic
        
        // Check if health is empty, game over
        if(health <= 0) {
            endGame();
            return;
        }
        
        // Update the snowmen's movement: move towards the player
        const enemySpeed = 0.06; // Doubled the speed to make it faster
        for(let i = 0; i < enemies.length; i++) {
            let enemy = enemies[i];
            // Calculate the direction toward the player
            const dir = new THREE.Vector3();
            dir.subVectors(camera.position, enemy.position);
            dir.y = 0; // Move only in the horizontal direction
            dir.normalize();
            // Movement speed
            enemy.position.x += dir.x * enemySpeed;
            enemy.position.z += dir.z * enemySpeed;
            // Motion animation: snowman jumps
            enemy.position.y = 0 + Math.sin(Date.now() * 0.005 + i) * 0.2;
            // Update the position of the physics rigid body and synchronize the collider
            const body = enemy.userData.physicsBody;
            if(body) {
                const transform = new AmmoLib.btTransform();
                body.getMotionState().getWorldTransform(transform);
                transform.setOrigin(new AmmoLib.btVector3(
                    enemy.position.x,
                    enemy.position.y,
                    enemy.position.z
                ));
                body.setWorldTransform(transform);
            }
        }
        
        // Check if all snowmen are killed, generate spider and shop
        if(enemies.length === 0 && gameStarted && !spiderGenerated) {
            spiderGenerated = true;
            // Calculate the position based on your requirements
            // 1. The midpoint of the line between two walls
            const midX = (LEFT_WALL_X + RIGHT_WALL_X) / 2;
            const midZ = camera.position.z;
            // 2. From midpoint: forward 10m, up 6m, right 8m for spider
            const spiderX = midX + 8; // Right 8m
            const spiderY = 6; // Up 6m
            const spiderZ = midZ + 10; // Forward 10m
            
            // Load the spider model first
            const loader = new GLTFLoader();
            loader.load('textures/MamanSpider.glb', function(gltf) {
                const spider = gltf.scene;
                // Set position
                spider.position.set(spiderX, spiderY, spiderZ);
                // Scale down by half
                spider.scale.set(0.5, 0.5, 0.5);
                // Make the spider face the player
                const dx = camera.position.x - spiderX;
                const dz = camera.position.z - spiderZ;
                spider.rotation.y = Math.atan2(dx, dz);
                // Enable shadow, use original model material
                spider.traverse(function(child) {
                    if(child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        // Use original material from the model file, no custom overrides
                    }
                });
                scene.add(spider);
                
                // Now load the Beavertail shop, updated parameters:
                // 1. 16m to the left of the spider
                // 2. Down 5m from spider's height
                // 3. Rotate 45 degrees counter-clockwise around Y axis
                // 4. Scale up by 2x, now 2.0
                const shopX = spiderX - 16; // Left 16m from spider
                const shopY = spiderY - 5; // Lower 1m from previous position
                const shopZ = spiderZ; // Same forward position as spider
                loader.load('textures/BeavertailStand.glb', function(gltf) {
                    const shop = gltf.scene;
                    // Set position
                    shop.position.set(shopX, shopY, shopZ);
                    // Scale up by 2x, now 2.0
                    shop.scale.set(2.0, 2.0, 2.0);
                    // Rotate 45 degrees counter-clockwise around Y axis
                    // In Three.js, positive Y rotation is counter-clockwise
                    shop.rotation.y = THREE.MathUtils.degToRad(45);
                    // Enable shadow
                    shop.traverse(function(child) {
                        if(child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            // Add physics body for shop to detect collision
                            const box = new THREE.Box3().setFromObject(child);
                            const size = new THREE.Vector3(
                                box.max.x - box.min.x,
                                box.max.y - box.min.y,
                                box.max.z - box.min.z
                            );
                            const boxCenter = box.getCenter(new THREE.Vector3());
                            createBoxRigidBody(child, size, 0, 0.0, boxCenter);
                        }
                    });
                    scene.add(shop);
                    // Save reference to shop mesh
                    shopMesh = shop;
                });
            });
        }
        
        // Check if player is near the shop
        if(shopMesh && !shopTriggered) {
            const distance = camera.position.distanceTo(shopMesh.position);
            if(distance < 3) { // If player is within 3 meters of the shop
                triggerShopDialog();
            }
        }
        
        // Detect collision between player and enemy, deduct health
        if(Date.now() > hitCooldown) {
            for(let i = 0; i < enemies.length; i++) {
                const enemy = enemies[i];
                const distance = camera.position.distanceTo(enemy.position);
                if(distance < 2) { // The player encountered an enemy.
                    health -= 10;
                    if(health < 0) health = 0;
                    statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
                    hitCooldown = Date.now() + 1000; // 1-second cooldown to prevent continuous HP loss
                    break;
                }
            }
        }
        
		renderer.render(scene, camera);
    }
    
}
window.onload = init;
