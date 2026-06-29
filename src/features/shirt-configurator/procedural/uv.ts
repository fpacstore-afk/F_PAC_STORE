import * as THREE from "three";
import { ShirtZone } from "./types";

/**
 * Maps 3D vertex coordinates to 2D UV coordinates.
 * Since we build our geometry procedurally using grid structures, we get perfect,
 * distortion-free UV coordinates automatically during the grid creation.
 */
export function applyProceduralUV(
  geometry: THREE.BufferGeometry,
  zone: ShirtZone,
  columns: number,
  rows: number
): void {
  // If we already set uv coordinates during vertex grid generation, this function serves
  // to fine-tune or adjust scale and orientation of UVs for specific customization areas.
  const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute;
  if (!uvAttr) return;

  const count = uvAttr.count;
  const uvs = uvAttr.array as Float32Array;

  // Let's ensure everything is perfectly aligned
  for (let i = 0; i < count; i++) {
    const idx = i * 2;
    let u = uvs[idx];
    let v = uvs[idx + 1];

    // Perfect clamping to avoid border artifacts
    uvs[idx] = Math.max(0, Math.min(1, u));
    uvs[idx + 1] = Math.max(0, Math.min(1, v));
  }

  uvAttr.needsUpdate = true;
}

/**
 * Calculates a custom texture coordinate offset for placing a logo or stamp
 * on a specific part of the shirt zone.
 */
export interface StampTransform {
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}

export function transformUVForStamp(
  u: number,
  v: number,
  transform: StampTransform
): THREE.Vector2 {
  // Translate to center (0.5, 0.5) before rotating and scaling
  let tu = u - 0.5 - transform.offsetX;
  let tv = v - 0.5 - transform.offsetY;

  // Apply scale (inverse for texture mapping)
  const s = 1.0 / transform.scale;
  tu *= s;
  tv *= s;

  // Apply rotation
  if (transform.rotation !== 0) {
    const rad = (transform.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ru = tu * cos - tv * sin;
    const rv = tu * sin + tv * cos;
    tu = ru;
    tv = rv;
  }

  // Translate back
  return new THREE.Vector2(tu + 0.5, tv + 0.5);
}
