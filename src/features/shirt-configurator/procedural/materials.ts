import * as THREE from "three";
import { PBRMaterialOptions } from "./types";

/**
 * Procedurally generates highly realistic fabric micro-weave textures
 * using standard HTML Canvas APIs to avoid external asset downloads.
 * Detects server-side environment (NodeJS) and returns undefined gracefully.
 */
export function getProceduralFabricMaps(): {
  map?: THREE.CanvasTexture;
  normalMap?: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
} {
  // If running on Node.js (during build/export scripts), return empty textures
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
    return {};
  }

  try {
    // 1. Generate Base Weave Texture
    const weaveCanvas = document.createElement("canvas");
    weaveCanvas.width = 128;
    weaveCanvas.height = 128;
    const ctx = weaveCanvas.getContext("2d");
    if (!ctx) return {};

    // Base soft cotton color
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);

    // Fine fabric criss-cross weave threads
    ctx.strokeStyle = "rgba(0, 0, 0, 0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 128; i += 2) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
    }

    // Add subtle cotton noise specks
    ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
    for (let i = 0; i < 400; i++) {
      const rx = Math.random() * 128;
      const ry = Math.random() * 128;
      ctx.fillRect(rx, ry, 1, 1);
    }

    const map = new THREE.CanvasTexture(weaveCanvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(40, 40); // Tiled finely over the shirt model

    // 2. Generate Fabric Normal Map for tactile physical reliefs
    const normCanvas = document.createElement("canvas");
    normCanvas.width = 128;
    normCanvas.height = 128;
    const nCtx = normCanvas.getContext("2d");
    if (nCtx) {
      nCtx.fillStyle = "#8080ff"; // Neutral flat normal blue
      nCtx.fillRect(0, 0, 128, 128);

      nCtx.fillStyle = "rgba(128, 0, 128, 0.08)"; // Purple height emboss
      for (let i = 0; i < 128; i += 2) {
        nCtx.fillRect(i, 0, 1, 128);
        nCtx.fillRect(0, i, 128, 1);
      }
    }

    const normalMap = new THREE.CanvasTexture(normCanvas);
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(40, 40);

    return { map, normalMap };
  } catch (err) {
    console.warn("Failed to generate canvas textures, falling back to pure materials", err);
    return {};
  }
}

/**
 * Creates high-fidelity Three.js MeshStandardMaterial optimized for fabrics.
 */
export function createFabricMaterial(options: PBRMaterialOptions): THREE.MeshStandardMaterial {
  const maps = options.useProceduralFabricTexture ? getProceduralFabricMaps() : {};

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(options.color),
    roughness: options.roughness,
    metalness: options.metalness,
    bumpScale: options.bumpScale ?? 0.01,
    side: THREE.DoubleSide, // Perfect rendering of interior surfaces
    shadowSide: THREE.DoubleSide,
  });

  if (maps.map) {
    material.map = maps.map;
  }
  if (maps.normalMap) {
    material.normalMap = maps.normalMap;
    material.normalScale = new THREE.Vector2(0.12, 0.12); // subtle tactile relief
  }

  return material;
}
