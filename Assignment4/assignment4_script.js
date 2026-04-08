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
let enemies = []; // Enemy array, different levels have different enemies
let health = 100; // Player's initial health
let coin = 0; // Coins obtained by killing enemies
let startButton;
let statusDisplay;
let hitCooldown = 0; // Health drain cooldown, prevents continuous health drain
let inShop = false; // Whether in the store interface
let gameStarted = false;
let gameOver = false; // Is the game over
let currentLevel = 1; // Current level, 1 = Snowman level, 2 = Spider level
let spiderTarget = null; // Spider's target
let spiderHealth = 0; // Spider's health, total health 200
let targetBody = null; // Target collider

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
function createBoxRigidBody(mesh, size, mass, restitution) {
    const shape = new Ammo.btBoxShape(new Ammo.btVector3(size.x/2, size.y/2, size.z/2));
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(
        mesh.position.x,
        mesh.position.y,
        mesh.position.z
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

// Open the store
function openShop() {
    inShop = true;
    const shopPanel = document.createElement('div');
    shopPanel.style.position = 'absolute';
    shopPanel.style.top = '50%';
    shopPanel.style.left = '50%';
    shopPanel.style.transform = 'translate(-50%, -50%)';
    shopPanel.style.padding = '30px';
    shopPanel.style.backgroundColor = 'rgba(0,0,0,0.8)';
    shopPanel.style.color = 'white';
    shopPanel.style.borderRadius = '10px';
    shopPanel.style.zIndex = '200';
    shopPanel.innerHTML = `
                <h2>Shop</h2>
                <p>You have ${coin} Coins, you can convert them to health, 1 Coin = 1 Health</p>
                <input type="number" id="healthInput" min="0" max="${coin}" value="0" style="width: 100%; padding: 8px; margin: 10px 0;">
                <button id="convertBtn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; width: 100%; margin-bottom: 10px;">Convert Health</button>
                <button id="continueBtn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; width: 100%;">Continue</button>
            `;
    document.body.appendChild(shopPanel);
    
    // Bind Convert Health Button
    document.getElementById('convertBtn').addEventListener('click', function() {
        const input = document.getElementById('healthInput');
        const amount = parseInt(input.value);
        if(amount > 0 && amount <= coin) {
            coin -= amount;
            health += amount;
            statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
            input.max = coin;
            input.value = 0;
        }
    });
    
    // Bind the continue button
    document.getElementById('continueBtn').addEventListener('click', function() {
        // Remove store panel
        document.body.removeChild(shopPanel);
        inShop = false;
        // Enter the next level and generate new enemies
        currentLevel += 1;
        generateNewEnemies();
        // Re-lock the mouse pointer and restore viewpoint control
        controls.lock();
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
        currentLevel = 1;
        spiderTarget = null;
        spiderHealth = 0;
        targetBody = null;
        // Reset all states
        health = 100;
        coin = 0;
        inShop = false;
        gameOver = false;
        gameStarted = false;
        hitCooldown = 0;
        // Update Status
        statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
        // Show start button
        startButton.style.display = 'block';
    });
}

// Generate a new batch of enemies for the new level
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
    // Clear previous spider-related residual variables
    spiderTarget = null;
    spiderHealth = 0;
    targetBody = null;
    
    const loader = new GLTFLoader();
    let modelPath, baseScale;
    if(currentLevel === 1) {
        // Level 1: Snowman Enemy
        modelPath = 'textures/snowman.glb';
        baseScale = 1;
    } else {
        // Level 2: Spider Enemy
        modelPath = 'textures/MamanSpider.glb';
        baseScale = 0.5; // Zoom in or out to make the spider the right size
    }
    
    loader.load(modelPath, function(gltf) {
        const baseEnemy = gltf.scene;
        baseEnemy.scale.set(baseScale, baseScale, baseScale);
        // Generate different numbers of enemies based on the level
        let enemyCount;
        let minEnemyX, maxEnemyX, enemyWidth;
        if(currentLevel === 1) {
            // Level 1: 5 snowmen, randomly distributed
            enemyCount = 5;
            // Calculate the size of the snowman
            const baseBox = new THREE.Box3().setFromObject(baseEnemy);
            enemyWidth = baseBox.max.x - baseBox.min.x;
            // Restrict the snowman from generating on the ice area between the snow piles on both sides
            const snowBankBetweenMinX = -23; // The right boundary of the snow pile on the left
            const snowBankBetweenMaxX = 3; // The left boundary of the snow pile on the right
            // Calculate the effective range of the snowman's center
            minEnemyX = snowBankBetweenMinX + enemyWidth / 2;
            maxEnemyX = snowBankBetweenMaxX - enemyWidth / 2;
        } else {
            // Level 2: 1 spider, BOSS enemy
            enemyCount = 1;
        }
        
        for(let i = 0; i < enemyCount; i++) {
            let x, z;
            if(currentLevel === 1) {
                // Level 1: Random Position
                x = minEnemyX + Math.random() * (maxEnemyX - minEnemyX);
                z = 50 + Math.random() * 200; // 50 to 250, far enough from the player, not too close
            } else {
                // Level 2: The spider is in the middle front position
                x = 0;
                z = 100;
            }
            // Clone the model to avoid loading it repeatedly
            const enemy = baseEnemy.clone();
            enemy.position.set(x, 0, z);
            // Enable shadow support for the enemy
            enemy.traverse(function(child) {
                if(child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(enemy);
            // Calculate the enemy's bounding box and create the corresponding collider
            const box = new THREE.Box3().setFromObject(enemy);
            const size = new THREE.Vector3(
                box.max.x - box.min.x,
                box.max.y - box.min.y,
                box.max.z - box.min.z
            );
            // Create dynamic rigid body, support movement
            createBoxRigidBody(
                enemy,
                size,
                1,
                1.0
            );
            // Save enemies to an array for collision detection
            enemies.push(enemy);
            
            // If it is the spider in the second level, add a target
            if(currentLevel === 2) {
                spiderHealth = 5; // Hit 5 times
                // Create and display the spider's health bar
                let healthBarContainer = document.getElementById('spiderHealthBarContainer');
                if(!healthBarContainer) {
                    // Creating the health bar element for the first time
                    healthBarContainer = document.createElement('div');
                    healthBarContainer.id = 'spiderHealthBarContainer';
                    healthBarContainer.style.position = 'absolute';
                    healthBarContainer.style.top = '50px';
                    healthBarContainer.style.left = '50%';
                    healthBarContainer.style.transform = 'translateX(-50%)';
                    healthBarContainer.style.width = '300px';
                    healthBarContainer.style.height = '20px';
                    healthBarContainer.style.backgroundColor = '#333333';
                    healthBarContainer.style.borderRadius = '10px';
                    healthBarContainer.style.zIndex = '100';
                    healthBarContainer.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
                    
                    const healthBar = document.createElement('div');
                    healthBar.id = 'spiderHealthBar';
                    healthBar.style.width = '100%';
                    healthBar.style.height = '100%';
                    healthBar.style.backgroundColor = '#ff4444';
                    healthBar.style.borderRadius = '10px';
                    healthBar.style.transition = 'width 0.2s ease-out';
                    
                    healthBarContainer.appendChild(healthBar);
                    document.body.appendChild(healthBarContainer);
                }
                // Display health bar
                healthBarContainer.style.display = 'block';
                document.getElementById('spiderHealthBar').style.width = '100%';
                
                // Set the targetBody to the spider's own body collider
                targetBody = enemy.userData.physicsBody;
            } else {
                // hid bar
                const healthBarContainer = document.getElementById('spiderHealthBarContainer');
                if(healthBarContainer) {
                    healthBarContainer.style.display = 'none';
                }
            }
        }
        gameStarted = true;
        console.log(gameStarted);
    });
}

// Start Game
function startGame() {
    // Hide Start button
    startButton.style.display = 'none';
    // Reset the level to Level 1
    currentLevel = 1;
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
        floorMesh.receiveShadow = true;
        //floorMesh.material.roughness = 0.3; // Low roughness of the ice surface, simulating a slippery effect
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
    leftWallMesh.position.set(-36, 0, 250);
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
    rightWallMesh.position.set(16, 0, 250);
    rightWallMesh.receiveShadow = true;
    rightWallMesh.material.roughness = 0.8;
    scene.add(rightWallMesh);
    createBoxRigidBody(
        rightWallMesh, 
        new THREE.Vector3(3.5, wallHeight, 500),
        0,
        1.0
    );

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
    light.shadow.camera.left = -25;
    light.shadow.camera.right = 25;
    light.shadow.camera.top = 25;
    light.shadow.camera.bottom = -25;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 50;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    light.position.set(20, 30, 20);
    light.target.position.set(0, 0, 100);
    scene.add(light.target);
    scene.add(light);
    
    const ambient = new THREE.AmbientLight(0x88ccff, 0.5); // cool-toned ambient light
    scene.add(ambient);
    
    const hemi = new THREE.HemisphereLight(0x88ccff, 0x444444, 0.4); // Cool-toned hemispherical light
    scene.add(hemi);
    
    const helper = new THREE.CameraHelper(light.shadow.camera);
    scene.add(helper);
    
    controls = new PointerLockControls(camera, document.body);
    
    const axesHelper = new THREE.AxesHelper(1000);
    scene.add(axesHelper);
    
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
            for(let i = 0; i < sphereMeshes.length; i++) {
                let ball = sphereMeshes[i];
                let ballBody = ball.userData.physicsBody;
                let ballPointer = AmmoLib.getPointer(ballBody);
                if(bodyAPointer !== cameraPointer && bodyBPointer !== cameraPointer &&
                    (bodyAPointer === ballPointer || bodyBPointer === ballPointer)) {
                    if (manifold.getNumContacts() > 0) {
                        // Check if it hit the enemy
                        let hitEnemy = false;
                        if(currentLevel === 1) {
                            // Level 1: Hitting the snowman kills it instantly
                            for(let j = 0; j < enemies.length; j++) {
                                let enemy = enemies[j];
                                if(enemy.userData.physicsBody) {
                                    let enemyPointer = AmmoLib.getPointer(enemy.userData.physicsBody);
                                    // It must be a collision between the ball and the enemy
                                    if(
                                        (bodyAPointer === enemyPointer && bodyBPointer === ballPointer) ||
                                        (bodyBPointer === enemyPointer && bodyAPointer === ballPointer)
                                    ) {
                                        // Hit the snowman to get Coins
                                        coin += 10;
                                        statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
                                        // Remove the snowman
                                        physicsWorld.removeRigidBody(enemy.userData.physicsBody);
                                        Ammo.destroy(enemy.userData.physicsBody.getMotionState());
                                        Ammo.destroy(enemy.userData.physicsBody);
                                        scene.remove(enemy);
                                        enemies.splice(j, 1);
                                        // Delete the ball at the same time
                                        destroyBall(ball);
                                        hitEnemy = true;
                                        break;
                                    }
                                }
                            }
                        } else {
                            // Level 2: Check if the target was hit
                            if(targetBody) {
                                let targetPointer = AmmoLib.getPointer(targetBody);
                                if(bodyAPointer === targetPointer || bodyBPointer === targetPointer) {
                                    // Hit the target, deduct the spider's health
                                    spiderHealth -= 1;
                                    // Update the spider's health bar
                                    const healthBar = document.getElementById('spiderHealthBar');
                                    if(healthBar) {
                                    healthBar.style.width = (spiderHealth / 5 * 100) + '%';
                                    }
                                    // Update the status display to show the spider's health
                                    statusDisplay.textContent = `Health: ${health} | Coin: ${coin} | Spider Health: ${spiderHealth}`;
                                    // Check if the spider is dead
                                    if(spiderHealth <= 0) {
                                        // Hide the health bar after the spider dies
                                        const healthBarContainer = document.getElementById('spiderHealthBarContainer');
                                        if(healthBarContainer) {
                                            healthBarContainer.style.display = 'none';
                                        }
                                        // The spider is dead, giving a 200 Coin as reward
                                        coin += 200;
                                        // Remove all related objects
                                        let spider = enemies[0];
                                        physicsWorld.removeRigidBody(spider.userData.physicsBody);
                                        Ammo.destroy(spider.userData.physicsBody.getMotionState());
                                        Ammo.destroy(spider.userData.physicsBody);
                                        physicsWorld.removeRigidBody(targetBody);
                                        Ammo.destroy(targetBody.getMotionState());
                                        Ammo.destroy(targetBody);
                                        scene.remove(spider);
                                        enemies = [];
                                        spiderTarget = null;
                                        targetBody = null;
                                        // Show clearance tips
                                        const winPanel = document.createElement('div');
                                        winPanel.style.position = 'absolute';
                                        winPanel.style.top = '50%';
                                        winPanel.style.left = '50%';
                                        winPanel.style.transform = 'translate(-50%, -50%)';
                                        winPanel.style.padding = '30px';
                                        winPanel.style.backgroundColor = 'rgba(0,0,0,0.8)';
                                        winPanel.style.color = 'white';
                                        winPanel.style.borderRadius = '10px';
                                        winPanel.style.zIndex = '200';
                                        winPanel.innerHTML = `
                                            <h2>Congratulations! You Win!</h2>
                                            <p>You got ${coin} Coins in total</p>
                                            <p>Would you like to buy a trophy?</p>
                                            <button id="enterShopBtn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; width: 100%; margin-bottom: 10px;">Enter Shop</button>
                                            <button id="restartBtn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; width: 100%;">Play Again</button>
                                        `;
                                        document.body.appendChild(winPanel);
                                                
                                        // Bind the button to enter the store
                                        document.getElementById('enterShopBtn').addEventListener('click', function() {
                                            // Remove the level completion panel
                                            document.body.removeChild(winPanel);
                                            // Load the shop model and place it in front of the player
                                            const loader = new GLTFLoader();
                                            loader.load('textures/BeavertailStand.glb', function(gltf) {
                                                const shop = gltf.scene;
                                                // Place it 5 meters in front of the player
                                                shop.position.set(camera.position.x, 0, camera.position.z + 5);
                                                shop.scale.set(0.5, 0.5, 0.5); // Scale size
                                                scene.add(shop);
                                            });
                                                    
                                            // Check if there are enough coins to buy the trophy
                                            if(coin >= 200) {
                                                coin -= 200;
                                                alert('You have bought and got the trophy!');
                                            } else {
                                                alert('You won, but you don\'t have enough Coins to buy the trophy.');
                                            }
                                        });
                                                
                                        // Bind the restart game button
                                        document.getElementById('restartBtn').addEventListener('click', function() {
                                            // Remove the level completion panel
                                            document.body.removeChild(winPanel);
                                            // Reset all game states
                                            health = 100;
                                            coin = 0;
                                            inShop = false;
                                            gameOver = false;
                                            gameStarted = false;
                                            hitCooldown = 0;
                                            enemies = [];
                                            currentLevel = 1;
                                            spiderTarget = null;
                                            targetBody = null;
                                            spiderHealth = 0;
                                            // Update status display
                                            statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
                                            // Show the start button and return to the initial state
                                            startButton.style.display = 'block';
                                        });
                                    }
                                    hitEnemy = true;
                                }
                            }
                        }

                        // Create a snowball explosion light effect
                        const particleCount = 10;
                        const geometry = new THREE.BufferGeometry();
                        const positions = new Float32Array(particleCount * 3);
                        const velocities = [];
                        for(let j = 0; j < particleCount; j++) {
                            positions[j*3] = ball.position.x;
                            positions[j*3+1] = ball.position.y;
                            positions[j*3+2] = ball.position.z;
                            velocities.push(new THREE.Vector3(
                                (Math.random() - 0.5) * 0.2, 
                                Math.random() * 0.2,
                                (Math.random() - 0.5) * 0.2
                            ));
                        }
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
                            for(let j = 0; j < particleCount; j++) {
                                pos[j*3] += velocities[j].x;
                                pos[j*3+1] += velocities[j].y;
                                pos[j*3+2] += velocities[j].z;
                                velocities[j].y -= 0.01; // Gravity effect
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
        
        /* 
        Double insurance position restriction: 
        Ensure that players do not move through both sides of the snow walls, 
	    and do not fall off the ground
        const pos = camera.position;
        X-axis restriction: limits the player within the frozen canal area, 
	    preventing them from moving beyond the snow piles on either side
        pos.x = Math.max(-34, Math.min(14, pos.x));
        Y-axis limit: Ensures the player always stays
	    above the ground and does not fall out of the scene
        pos.y = Math.max(0, pos.y);
        camera.position.copy(pos);
        */
        
        // Check game status
        if(gameOver) return; // Game over, pause all logic
        if(inShop) return; // Store interface, pause all logic
        
        // Check if health is empty, game over
        if(health <= 0) {
            endGame();
            return;
        }
        
        // Check whether all enemies have been killed, then enter the shop
        if(enemies.length === 0 && gameStarted) {
            openShop();
            return;
        }
        
        // Update the enemy's movement: move towards the player,
	    // with different speeds for different levels
        let enemySpeed = currentLevel === 1 ? 0.03 : 0.05; // The spiders are faster in the second level
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
            // Motion animation:
	        // In level 1, the snowman jumps;
	        // in level 2, the spider does not jump
            if(currentLevel === 1) {
                enemy.position.y = 0 + Math.sin(Date.now() * 0.005 + i) * 0.2;
            }
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
        
        // Detect collision between player and enemy, deduct health
        if(Date.now() > hitCooldown) {
            for(let i = 0; i < enemies.length; i++) {
                const enemy = enemies[i];
                const distance = camera.position.distanceTo(enemy.position);
                if(distance < 2) { // The player encountered an enemy.
                    // Yeti deducts 10, spider deducts 20
                    if(currentLevel === 1) {
                        health -= 10;
                    } else {
                        health -= 20;
                    }
                    if(health < 0) health = 0;
                    statusDisplay.textContent = `Health: ${health} | Coin: ${coin}`;
                    hitCooldown = Date.now() + 1000; // 1-second cooldown to prevent continuous HP loss
                    break;
                }
            }
        }
        
        // Keep the spider's target always facing the player
        if(spiderTarget) {
            spiderTarget.lookAt(camera.position);
        }
        
        // The second level updates the status display, showing the spider's health
        if(currentLevel === 2) {
            statusDisplay.textContent = `Health: ${health} | Coin: ${coin} | Spider Health: ${spiderHealth}`;
        }
        
		renderer.render(scene, camera);
    }
    
}
window.onload = init;
