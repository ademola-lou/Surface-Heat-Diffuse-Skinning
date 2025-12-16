// Import the Emscripten module
import { createSurfaceHeatDiffuse } from './src/wasm-module.js';
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const myWorker = new Worker("worker.js");

myWorker.postMessage([4, 4])

myWorker.onmessage = function(e) {
    console.log('Message received from worker', e.data);
}
function createTestMesh() {
    const geometry0 = new THREE.CylinderGeometry(0.3, 1, 3, 32, 32);
    geometry0.computeVertexNormals();
    
    let geometry = geometry0;
    
    // Define bone segments with explicit start/end positions
    const boneSegments = [
        {
            start: new THREE.Vector3(0, -1.5, 0),  // Bottom
            end: new THREE.Vector3(0, -0.5, 0)     // Lower third
        },
        {
            start: new THREE.Vector3(0, -0.5, 0),  // Lower third
            end: new THREE.Vector3(0, 0.5, 0)      // Upper third
        },
        {
            start: new THREE.Vector3(0, 0.5, 0),   // Upper third
            end: new THREE.Vector3(0, 1.5, 0)      // Top
        }
    ];
    
    // Create bones from segments
    const bones = [];
    let parentBone = null;
    
    boneSegments.forEach((segment, index) => {
        const bone = new THREE.Bone();
        bones.push(bone);
        
        // Set bone position to start position
        bone.position.copy(segment.start);
        
        if (parentBone) {
            // Position is relative to parent, so convert to local space
            const localPosition = segment.start.clone().sub(boneSegments[index-1].start);
            bone.position.copy(localPosition);
            parentBone.add(bone);
        }
        
        parentBone = bone;
    });
    
    const skeleton = new THREE.Skeleton(bones);
    
    // Update bone matrices
    bones.forEach(bone => bone.updateMatrixWorld(true));
    
    const mesh = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
    mesh.add(bones[0]); // Add root bone to mesh
    mesh.skeleton = skeleton;
    
    // Add bone visualization
    const boneVisualization = new THREE.Group();
    
    boneSegments.forEach((segment, index) => {
        // Create a small sphere for each bone joint
        const sphereGeom = new THREE.SphereGeometry(0.1);
        const sphereMesh = new THREE.Mesh(
            sphereGeom,
            new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false })
        );
        sphereMesh.position.copy(segment.start);
        sphereMesh.renderOrder = 1000;
        boneVisualization.add(sphereMesh);
        
        // Create a line to the next position
        const points = [segment.start, segment.end];
        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(
            lineGeom,
            new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false })
        );
        line.renderOrder = 1000;
        boneVisualization.add(line);
        
        // Add sphere for end position of last bone
        if (index === boneSegments.length - 1) {
            const endSphereMesh = sphereMesh.clone();
            endSphereMesh.position.copy(segment.end);
            boneVisualization.add(endSphereMesh);
        }
    });
    
    mesh.add(boneVisualization);
    return mesh;
}

async function calculateSkinWeights(geometry, skeleton) {
    try {
        // Wait for the module to initialize
        const Module = await createSurfaceHeatDiffuse();
        
        // Convert Three.js geometry to arrays
        const vertices = new Float32Array(geometry.attributes.position.array);
        const indices = new Uint32Array(geometry.index.array);
        
        if (!vertices.length || !indices.length) {
            throw new Error('Invalid geometry: No vertices or indices found');
        }
        
        if (!skeleton || !skeleton.bones.length) {
            throw new Error('Invalid skeleton: No bones found');
        }
        
        // Convert skeleton to array format
        const bones = [];
        skeleton.bones.forEach((bone, index) => {
            // Get world positions
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);
            
            // Get end position (either next bone or extend current)
            let endPos = new THREE.Vector3();
            if (bone.children.length > 0) {
                bone.children[0].getWorldPosition(endPos);
            } else {
                endPos.copy(worldPos).add(new THREE.Vector3(0, 1, 0));
            }
            
            // Add bone data: [index, headX,headY,headZ, tailX,tailY,tailZ]
            bones.push(
                index,
                worldPos.x, worldPos.y, worldPos.z,
                endPos.x, endPos.y, endPos.z
            );
            
            console.log(`Bone ${index}:`, {
                start: [worldPos.x, worldPos.y, worldPos.z],
                end: [endPos.x, endPos.y, endPos.z]
            });
        });

        // Create the diffuser instance with adjusted parameters
        const diffuser = new Module.SurfaceHeatDiffuse(
            vertices,
            indices,
            bones,
            64,    // maxGridNum - increased for better resolution
            5,    // maxDiffuseLoop - increased for more iterations
            64,   // maxSampleNum - increased for better sampling
            4,     // maxInfluence
            0.2,  // maxFallOff - reduced for smoother falloff
            1,     // sharpness - set to soft for smoother transitions
            false  // detectSolidify
        );

        // Calculate weights
        const result = diffuser.calculateWeights();
        if (!result) {
            throw new Error('Failed to calculate weights');
        }
        
        // Apply the weights to the geometry
        const skinIndices = new Float32Array(result.indices);
        const skinWeights = new Float32Array(result.weights);
        console.log(skinIndices);
        console.log(skinWeights);

        geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
        geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));

    } catch (error) {
        console.error('Error in calculateSkinWeights:', error);
        throw error;
    }
}

// Test the weight calculation
async function test() {
    try {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
        window.scene = scene;

        const testMesh = createTestMesh();
        const geometry = testMesh.geometry;
        const skeleton = testMesh.skeleton;
        await calculateSkinWeights(geometry, skeleton);
        console.log('Weight calculation successful!');
        
        
       
        // Apply the weight visualization shader
        visualizeBoneInfluence(testMesh, skeleton);
        scene.add(testMesh);

        //add a light
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(10, 10, 10);
        scene.add(light);

        //add a camera
        camera.position.set(3, 2, 5);
        camera.lookAt(0, 0, 0);

        const controls = new OrbitControls(camera, renderer.domElement);
        
        // Add some rotation to better see the weights
        function animate() {
            requestAnimationFrame(animate);
            // testMesh.rotation.y += 0.01;
            
            // Update bone visualization
            testMesh.children[0].children.forEach((child) => {
                if (child instanceof THREE.Line) {
                    const points = child.geometry.attributes.position;
                    const bone = skeleton.bones[Math.floor(points.count / 2)];
                    points.setXYZ(0, bone.getWorldPosition(new THREE.Vector3()).x,
                                    bone.getWorldPosition(new THREE.Vector3()).y,
                                    bone.getWorldPosition(new THREE.Vector3()).z);
                    if (bone.children.length > 0) {
                        points.setXYZ(1, bone.children[0].getWorldPosition(new THREE.Vector3()).x,
                                        bone.children[0].getWorldPosition(new THREE.Vector3()).y,
                                        bone.children[0].getWorldPosition(new THREE.Vector3()).z);
                    }
                    points.needsUpdate = true;
                }
            });
            
            renderer.render(scene, camera);
        }
        animate();
    } catch (error) {
        console.error('Test failed:', error);
    }
}

function visualizeBoneInfluence(mesh, skeleton) {
    const weightShader = {
        uniforms: {
            boneIndex: { value: 0 }
        },
        vertexShader: `
            attribute vec4 skinIndex;
            attribute vec4 skinWeight;
            uniform int boneIndex;
            
            varying float influence;
            varying vec3 vPosition;
            
            void main() {
                // Get the influence of the selected bone
                influence = 0.0;
                for(int i = 0; i < 4; i++) {
                    if(int(skinIndex[i]) == boneIndex) {
                        influence = skinWeight[i];
                        break;
                    }
                }
                
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying float influence;
            varying vec3 vPosition;
            
            void main() {
                vec3 color;
                float weight = influence;
                
                // Enhanced visualization with position-based debugging
                // if (weight < 0.01) {
                //     color = vec3(0.1, 0.1, 0.1); // Very dark gray for near-zero weights
                // } else if (weight < 0.25) {
                //     color = mix(vec3(0.0, 0.0, 0.5), vec3(0.0, 0.0, 1.0), weight * 4.0);
                // } else if (weight < 0.5) {
                //     color = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), (weight - 0.25) * 4.0);
                // } else if (weight < 0.75) {
                //     color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (weight - 0.5) * 4.0);
                // } else {
                //     color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (weight - 0.75) * 4.0);
                // }
                
                if (weight < 0.25) {
                    // Blend between blue and cyan
                    color = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), weight / 0.25);
                } else if (weight < 0.5) {
                    // Blend between cyan and green
                    color = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (weight - 0.25) / 0.25);
                } else if (weight < 0.75) {
                    // Blend between green and yellow
                    color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (weight - 0.5) / 0.25);
                } else {
                    // Blend between yellow and red
                    color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (weight - 0.75) / 0.25);
                }
                gl_FragColor = vec4(color, 1.0);
            }
        `
    };
  // Create the material and apply it to the mesh
  const material = new THREE.ShaderMaterial(weightShader);
  mesh.material = material;

  // Add GUI to control which bone's influence to show
  let currentBone = 0;
  
  // Create simple UI controls
  const controls = document.createElement('div');
  controls.style.position = 'absolute';
  controls.style.top = '10px';
  controls.style.left = '10px';
  controls.style.background = 'rgba(0,0,0,0.5)';
  controls.style.padding = '10px';
  controls.style.color = 'white';
  document.body.appendChild(controls);

  const label = document.createElement('span');
  label.textContent = 'Bone: 0';
  controls.appendChild(label);

  const nextButton = document.createElement('button');
  nextButton.textContent = 'Next Bone';
  nextButton.style.marginLeft = '10px';
  nextButton.onclick = () => {
    currentBone = (currentBone + 1) % skeleton.bones.length;
    material.uniforms.boneIndex.value = currentBone;
    label.textContent = `Bone: ${currentBone}`;
  };
  controls.appendChild(nextButton);

  return material;
}

test();