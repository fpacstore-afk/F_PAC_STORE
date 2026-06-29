import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

/**
 * Procedurally exports any Three.js object group into a highly optimized binary GLB file.
 * Returns a Promise that resolves with the raw ArrayBuffer.
 */
export function exportShirtToGLB(shirtGroup: THREE.Group): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    // Create a dedicated clean export scene and clone our group to keep the original untouched
    const exportScene = new THREE.Scene();
    const clonedGroup = shirtGroup.clone();

    // Standardize root transforms so that external 3D software (Blender, Unity, Shopify etc.)
    // reads the origin, scaling, and up-vector coordinates as completely normalized (y-up).
    clonedGroup.position.set(0, 0, 0);
    clonedGroup.rotation.set(0, 0, 0);
    clonedGroup.scale.set(1, 1, 1);
    exportScene.add(clonedGroup);

    console.log("DEBUG: Initializing GLTFExporter parse...");
    const exporter = new GLTFExporter();

    exporter.parse(
      exportScene,
      (gltf) => {
        console.log("DEBUG: GLTFExporter parse completed. Type of gltf:", typeof gltf, gltf instanceof ArrayBuffer ? "is ArrayBuffer" : "is NOT ArrayBuffer");
        if (gltf instanceof ArrayBuffer) {
          resolve(gltf);
        } else {
          // If the exporter falls back to a JSON structure for some reason, let's see if we can convert it to string or serialize it
          console.log("DEBUG: Gltf was JSON, keys:", Object.keys(gltf));
          reject(
            new Error(
              "GLTFExporter returned a JSON structure. Ensure option { binary: true } is active to output binary GLB."
            )
          );
        }
      },
      (error) => {
        console.error("DEBUG: GLTFExporter parse error:", error);
        reject(error);
      },
      {
        binary: true,
        animations: [],
        includeCustomExtensions: false,
        onlyVisible: false,
      }
    );
  });
}
