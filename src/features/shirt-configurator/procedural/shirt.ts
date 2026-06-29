import * as THREE from "three";
import { buildBodyPanel, buildSleeve, buildCollar } from "./geometry";
import { createFabricMaterial } from "./materials";
import { ShirtMeasurements } from "./types";

/**
 * Default precise measurements matching real high-end oversized proportions:
 * Length: 80cm, Width: 67cm, Shoulder: 30cm, Sleeve: 26cm, Sleeve Width: 23cm, Collar: 18cm, Thickness: 3mm
 */
export const DEFAULT_MEASUREMENTS: ShirtMeasurements = {
  length: 0.80,       // 80 cm
  width: 0.67,        // 67 cm
  shoulder: 0.30,     // 30 cm
  sleeveLength: 0.26, // 26 cm
  sleeveWidth: 0.23,  // 23 cm
  collarWidth: 0.18,  // 18 cm
  thickness: 0.003,    // 3 mm
};

/**
 * Assembles the full procedural oversized shirt group with proper zoning names,
 * materials, shadow configurations, and visual alignments.
 */
export function buildOversizedShirtGroup(
  measurements = DEFAULT_MEASUREMENTS,
  baseColor = "#111112"
): THREE.Group {
  const shirtGroup = new THREE.Group();
  shirtGroup.name = "oversizedShirt";

  // 1. Setup Premium PBR Materials (Body vs Collar)
  const bodyMaterial = createFabricMaterial({
    color: baseColor,
    roughness: 0.88,
    metalness: 0.01,
    bumpScale: 0.02,
    useProceduralFabricTexture: true,
  });

  const collarMaterial = createFabricMaterial({
    color: baseColor,
    roughness: 0.78, // Slightly smoother, ribbed shine
    metalness: 0.01,
    bumpScale: 0.015,
    useProceduralFabricTexture: true,
  });

  // 2. Build and attach the front panel
  const frontGeom = buildBodyPanel(true, measurements);
  const frontMesh = new THREE.Mesh(frontGeom, bodyMaterial);
  frontMesh.name = "front";
  frontMesh.castShadow = true;
  frontMesh.receiveShadow = true;
  shirtGroup.add(frontMesh);

  // 3. Build and attach the back panel
  const backGeom = buildBodyPanel(false, measurements);
  const backMesh = new THREE.Mesh(backGeom, bodyMaterial);
  backMesh.name = "back";
  backMesh.castShadow = true;
  backMesh.receiveShadow = true;
  shirtGroup.add(backMesh);

  // 4. Build and attach the left sleeve
  const leftSleeveGeom = buildSleeve(true, measurements);
  const leftSleeveMesh = new THREE.Mesh(leftSleeveGeom, bodyMaterial);
  leftSleeveMesh.name = "leftSleeve";
  leftSleeveMesh.castShadow = true;
  leftSleeveMesh.receiveShadow = true;
  shirtGroup.add(leftSleeveMesh);

  // 5. Build and attach the right sleeve
  const rightSleeveGeom = buildSleeve(false, measurements);
  const rightSleeveMesh = new THREE.Mesh(rightSleeveGeom, bodyMaterial);
  rightSleeveMesh.name = "rightSleeve";
  rightSleeveMesh.castShadow = true;
  rightSleeveMesh.receiveShadow = true;
  shirtGroup.add(rightSleeveMesh);

  // 6. Build and attach the ribbed collar band
  const collarGeom = buildCollar(measurements);
  const collarMesh = new THREE.Mesh(collarGeom, collarMaterial);
  collarMesh.name = "collar";
  collarMesh.castShadow = true;
  collarMesh.receiveShadow = true;
  shirtGroup.add(collarMesh);

  // Center the pivot point in the middle of the shirt's torso for clean rotation controls
  shirtGroup.position.set(0, -measurements.length / 2, 0);

  return shirtGroup;
}
export { buildBodyPanel, buildSleeve, buildCollar };
