import * as THREE from "three";

/**
 * Simulates organic fabric folds and wrinkles using multi-frequency trigonometric wave superposition.
 * This is lightweight, has no dependencies, and generates smooth, predictable drapes.
 */
export function getFabricFold(x: number, y: number, z: number, intensity = 1.0): number {
  const f1 = Math.sin(y * 18 + x * 8) * 0.5;
  const f2 = Math.cos(y * 32 - x * 15 + z * 10) * 0.25;
  const f3 = Math.sin(x * 24 + z * 18) * 0.125;
  const f4 = Math.cos(y * 50) * 0.0625;
  return (f1 + f2 + f3 + f4) * intensity;
}

/**
 * Calculates a point along a quadratic Bezier curve.
 */
export function getBezierPoint(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  t: number
): THREE.Vector3 {
  const oneMinusT = 1 - t;
  return new THREE.Vector3()
    .addScaledVector(p0, oneMinusT * oneMinusT)
    .addScaledVector(p1, 2 * oneMinusT * t)
    .addScaledVector(p2, t * t);
}

/**
 * Calculates the normalized tangent along a quadratic Bezier curve at parameter t.
 */
export function getBezierTangent(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  t: number
): THREE.Vector3 {
  const oneMinusT = 1 - t;
  const d1 = new THREE.Vector3().subVectors(p1, p0).multiplyScalar(2 * oneMinusT);
  const d2 = new THREE.Vector3().subVectors(p2, p1).multiplyScalar(2 * t);
  return new THREE.Vector3().addVectors(d1, d2).normalize();
}

/**
 * Helper to construct an orthonormal coordinate frame (Tangent, Normal, Binormal) along a curve.
 * This is crucial for smooth extrusion of sleeve tubes.
 */
export function getOrthonormalFrame(tangent: THREE.Vector3, upPreference = new THREE.Vector3(0, 1, 0)): {
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
} {
  const binormal = new THREE.Vector3().crossVectors(tangent, upPreference);
  if (binormal.lengthSq() < 0.0001) {
    // If tangent is parallel to upPreference, use another axis
    binormal.crossVectors(tangent, new THREE.Vector3(0, 0, 1));
  }
  binormal.normalize();
  const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
  return { normal, binormal };
}
