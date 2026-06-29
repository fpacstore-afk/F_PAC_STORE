import * as THREE from "three";

export type ShirtZone = "front" | "back" | "leftSleeve" | "rightSleeve" | "collar";

export interface ShirtMeasurements {
  length: number;       // e.g. 0.80 (80 cm)
  width: number;        // e.g. 0.67 (67 cm)
  shoulder: number;     // e.g. 0.30 (30 cm)
  sleeveLength: number; // e.g. 0.26 (26 cm)
  sleeveWidth: number;  // e.g. 0.23 (23 cm)
  collarWidth: number;  // e.g. 0.18 (18 cm)
  thickness: number;    // e.g. 0.003 (3 mm)
}

export interface ProceduralGeometryResult {
  geometry: THREE.BufferGeometry;
  zone: ShirtZone;
}

export interface PBRMaterialOptions {
  color: string;
  roughness: number;
  metalness: number;
  bumpScale?: number;
  useProceduralFabricTexture?: boolean;
}

export interface StampTransform {
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}

