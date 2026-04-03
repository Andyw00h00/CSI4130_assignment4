/*  CSI4130 Assignment 4
    File: assignment4_script.js
    Students: Andrew Guerette (300287614)
*/

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let scene;
let physicsWorld;
let AmmoLib;
let lastTime = performance.now();
let controls;
let sphereMeshes = [];
let floorMesh;
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

    AmmoLib = await Ammo();
    initPhysicsWorld();

    floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(100, 1, 100),
        new THREE.MeshStandardMaterial({color: 'grey'})
    );
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    createBoxRigidBody(
        floorMesh, 
        new THREE.Vector3(100, 1, 100),
        0,
        1.0
    );

	// Camera
	// calcaulate aspectRatio
	var aspectRatio = window.innerWidth/window.innerHeight;
	camera = new THREE.PerspectiveCamera(45, aspectRatio, 0.1, 5000);
    // position the camera back and point to the center of the scene
    camera.position.set(5, 5, 5);
    createSphereRigidBody(camera, 0.1, 1, 0.0);

    // Add light to the scene
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(30, 50, 30);
    light.castShadow = true;
    scene.add(light);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    controls = new PointerLockControls(camera, document.body);

    const axesHelper = new THREE.AxesHelper(1000);
    scene.add(axesHelper);

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
        let floorBody = floorMesh.userData.physicsBody;
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

            for(let i = 0; i < sphereMeshes.length; i++) {
                let ballPointer = AmmoLib.getPointer(sphereMeshes[i].userData.physicsBody);
                if(bodyAPointer !== cameraPointer && bodyBPointer !== cameraPointer &&
                    (bodyAPointer === ballPointer || bodyBPointer === ballPointer)) {
                    if (manifold.getNumContacts() > 0) {
                        let mesh = sphereMeshes[i];
                        let body = mesh.userData.physicsBody;
                        destroyBall(sphereMeshes[i]);
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
        direction.multiplyScalar(2);
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
		renderer.render(scene, camera);
    }
    
}

function createSphereRigidBody(mesh, radius, mass, restitution) {

    const shape = new AmmoLib.btSphereShape(radius);

    const transform = new AmmoLib.btTransform();
    transform.setIdentity();
    transform.setOrigin(new AmmoLib.btVector3(
        mesh.position.x,
        mesh.position.y,
        mesh.position.z
    ));

    const motionState = new AmmoLib.btDefaultMotionState(transform);

    const localInertia = new AmmoLib.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);

    const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(
        mass,
        motionState,
        shape,
        localInertia
    );

    const body = new AmmoLib.btRigidBody(rbInfo);

    body.setRestitution(restitution);

    physicsWorld.addRigidBody(body);

    mesh.userData.physicsBody = body;

    Ammo.destroy(rbInfo);
    Ammo.destroy(localInertia);
    Ammo.destroy(transform);
    
}

function createBoxRigidBody(mesh, size, mass, restitution) {

    const halfExtents = new AmmoLib.btVector3(
        size.x * 0.5,
        size.y * 0.5,
        size.z * 0.5
    );

    const shape = new AmmoLib.btBoxShape(halfExtents);

    const transform = new AmmoLib.btTransform();
    transform.setIdentity();
    transform.setOrigin(new AmmoLib.btVector3(
        mesh.position.x,
        mesh.position.y,
        mesh.position.z
    ));

    /* *****FOR MESH ROTATION******
    let quat = mesh.quaternion;
    transform.setRotation(new AmmoLib.btQuaternion(quat.x, quat.y, quat.z, quat.w));*/

    const motionState = new AmmoLib.btDefaultMotionState(transform);

    const localInertia = new AmmoLib.btVector3(0, 0, 0);
    if (mass > 0) shape.calculateLocalInertia(mass, localInertia);

    const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(
        mass,
        motionState,
        shape,
        localInertia
    );

    const body = new AmmoLib.btRigidBody(rbInfo);
    body.setRestitution(restitution);
    body.setFriction(0.2);

    physicsWorld.addRigidBody(body);

    mesh.userData.physicsBody = body;
}


document.addEventListener('click', function () {
    controls.lock();
});

window.addEventListener('keydown', function(event) {
    let lowerCaseKey = event.key.toLowerCase();
    if(lowerCaseKey == 'w') {
        keys.w = true;
    }
    if(lowerCaseKey == 'a') {
        keys.a = true;
    }
    if(lowerCaseKey == 's') {
        keys.s = true;
    }
    if(lowerCaseKey == 'd') {
        keys.d = true;
    }
    if(lowerCaseKey == ' ') {
        keys.up = true;
    }
    if(lowerCaseKey == 'shift') {
        keys.down = true;
    }
    if(lowerCaseKey == 'e') {
        keys.e = true;
    }
}, { passive: false });

window.addEventListener('keyup', function(event) {
    let lowerCaseKey = event.key.toLowerCase();
    if(lowerCaseKey == 'w') {
        keys.w = false;
    }
    if(lowerCaseKey == 'a') {
        keys.a = false;
    }
    if(lowerCaseKey == 's') {
        keys.s = false;
    }
    if(lowerCaseKey == 'd') {
        keys.d = false;
    }
    if(lowerCaseKey == ' ') {
        keys.up = false;
    }
    if(lowerCaseKey == 'shift') {
        keys.down = false;
    }
    if(lowerCaseKey == 'e') {
        keys.e = false;
        ballThrown = false;
    }

}, { passive: false });

function throwBall() {
    let mesh = createBall();
    //repositionBody(camera.position.x, camera.position.y, camera.position.z, body, mesh);
    let direction = new THREE.Vector3(0, 0.5, -1);
    let quat = camera.quaternion;
    direction.applyQuaternion(quat);
    direction.multiplyScalar(20);
    mesh.userData.physicsBody.applyCentralImpulse(new AmmoLib.btVector3(direction.x, direction.y, direction.z));
}

function repositionBody(x, y, z, body, mesh) {
    let motion = body.getMotionState();
    if(motion) {
        const transform = new AmmoLib.btTransform();
        motion.getWorldTransform(transform);
        transform.setOrigin(new Ammo.btVector3(x, y, z));
        body.setWorldTransform(transform);
        body.getMotionState().setWorldTransform(transform);
        body.activate(true);
        body.setLinearVelocity(new Ammo.btVector3(0,0,0));
        body.setAngularVelocity(new Ammo.btVector3(0,0,0));
        mesh.position.set(x, y, z);
    }
}

function createBall() {
    let radius = 0.1;
    let sphere = new THREE.SphereGeometry(radius, 100, 100);
    let material = new THREE.MeshStandardMaterial({color: 'white'});
    let sphereMesh = new THREE.Mesh(sphere, material);
    let cameraPosition = camera.position;
    sphereMesh.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    sphereMesh.castShadow = true;
    sphereMeshes.push(sphereMesh);
    scene.add(sphereMesh);
    createSphereRigidBody(sphereMesh, radius, 1, 0.5);

    return sphereMesh;
}

function destroyBall(mesh) {
    let body = mesh.userData.physicsBody;
    physicsWorld.removeRigidBody(body);
    Ammo.destroy(body.getMotionState());
    Ammo.destroy(body);

    let index = sphereMeshes.indexOf(mesh);
    if(index !== -1) {
        sphereMeshes.splice(index, 1);
    }

    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
}

window.onload = init;
