import * as THREE from "three";
import { buildBodyPanel, buildSleeve, buildCollar, buildPrintPlane, mergeAndWeldGeometries } from "./geometry";
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
 * Assembles the full procedural oversized shirt group with the exact names
 * and materials required for a professional virtual fitting room export.
 * Rebuilds the model as a SINGLE continuous piece of clothing.
 */
export function buildOversizedShirtGroup(
  measurements = DEFAULT_MEASUREMENTS,
  baseColor = "#ffffff" // Pure white base color as requested by default
): THREE.Group {
  const shirtGroup = new THREE.Group();
  shirtGroup.name = "oversizedShirt";

  // 1. Setup Premium PBR Materials with proper names
  const bodyMaterial = createFabricMaterial({
    color: baseColor,
    roughness: 0.85,
    metalness: 0.0,
    bumpScale: 0.015,
    useProceduralFabricTexture: true,
  });
  bodyMaterial.name = "Fabric";

  // Transparent PrintMaterial for the customizeable graphic areas
  const printMaterial = new THREE.MeshStandardMaterial({
    name: "PrintMaterial",
    color: new THREE.Color("#ffffff"),
    roughness: 0.8,
    metalness: 0.0,
    transparent: true,
    opacity: 0.0, // Invisible by default to prevent blocking base, but ready for texture application!
    side: THREE.DoubleSide,
    depthWrite: false
  });

  // 2. Build individual panels and weld them all together into a SINGLE continuous mesh!
  const frontGeom = buildBodyPanel(true, measurements);
  const backGeom = buildBodyPanel(false, measurements);
  const leftSleeveGeom = buildSleeve(true, measurements);
  const rightSleeveGeom = buildSleeve(false, measurements);
  const collarGeom = buildCollar(measurements);

  const continuousGeom = mergeAndWeldGeometries([
    frontGeom,
    backGeom,
    leftSleeveGeom,
    rightSleeveGeom,
    collarGeom,
  ]);

  const tshirtMesh = new THREE.Mesh(continuousGeom, bodyMaterial);
  tshirtMesh.name = "Tshirt";
  tshirtMesh.castShadow = true;
  tshirtMesh.receiveShadow = true;
  shirtGroup.add(tshirtMesh);

  // 3. Build and attach the independent Print meshes (hovering 0.8mm for high-quality printing)
  const frontPrintGeom = buildPrintPlane("front", measurements);
  const frontPrintMesh = new THREE.Mesh(frontPrintGeom, printMaterial);
  frontPrintMesh.name = "FrontPrint";
  shirtGroup.add(frontPrintMesh);

  const backPrintGeom = buildPrintPlane("back", measurements);
  const backPrintMesh = new THREE.Mesh(backPrintGeom, printMaterial);
  backPrintMesh.name = "BackPrint";
  shirtGroup.add(backPrintMesh);

  const leftPrintGeom = buildPrintPlane("left", measurements);
  const leftPrintMesh = new THREE.Mesh(leftPrintGeom, printMaterial);
  leftPrintMesh.name = "LeftPrint";
  shirtGroup.add(leftPrintMesh);

  const rightPrintGeom = buildPrintPlane("right", measurements);
  const rightPrintMesh = new THREE.Mesh(rightPrintGeom, printMaterial);
  rightPrintMesh.name = "RightPrint";
  shirtGroup.add(rightPrintMesh);

  // Center the pivot point in the middle of the shirt's torso for clean rotation controls
  shirtGroup.position.set(0, -measurements.length / 2, 0);

  return shirtGroup;
}

export { buildBodyPanel, buildSleeve, buildCollar, buildPrintPlane, mergeAndWeldGeometries };
