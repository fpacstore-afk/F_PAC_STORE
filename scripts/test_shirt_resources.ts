import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeShirt } from '../src/features/shirt-configurator/procedural/dispose';

const geometry = new THREE.BoxGeometry();
const texture = new THREE.Texture();
const material = new THREE.MeshStandardMaterial({ map: texture, normalMap: texture });
const group = new THREE.Group();
group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, [material, material]));
const calls = { geometry: 0, material: 0, texture: 0 };
geometry.addEventListener('dispose', () => calls.geometry++);
material.addEventListener('dispose', () => calls.material++);
texture.addEventListener('dispose', () => calls.texture++);
disposeShirt(group);
assert.deepEqual(calls, { geometry: 1, material: 1, texture: 1 });
console.log('Shared shirt GPU resources are released once per owned resource.');
