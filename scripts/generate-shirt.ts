import fs from "fs";
import path from "path";
import * as THREE from "three";

// --- Headless Node.js Polyfills for Three.js GLTFExporter ---
if (typeof global.FileReader === "undefined") {
  class NodeFileReader {
    onload: any = null;
    onloadend: any = null;
    onerror: any = null;
    result: any = null;

    readAsArrayBuffer(blob: any) {
      setTimeout(() => {
        if (!blob) {
          if (this.onerror) this.onerror(new Error("Null blob passed to FileReader"));
          return;
        }

        if (typeof blob.arrayBuffer === "function") {
          blob.arrayBuffer()
            .then((buf: ArrayBuffer) => {
              this.result = buf;
              if (this.onload) this.onload({ target: { result: buf } });
              if (this.onloadend) this.onloadend({ target: { result: buf } });
            })
            .catch((err: any) => {
              if (this.onerror) this.onerror(err);
            });
        } else if (blob.buffer) {
          // Handle ArrayBufferViews or node buffers
          const arrayBuffer = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
          this.result = arrayBuffer;
          if (this.onload) this.onload({ target: { result: arrayBuffer } });
          if (this.onloadend) this.onloadend({ target: { result: arrayBuffer } });
        } else {
          if (this.onerror) this.onerror(new Error("Unsupported blob format in polyfill"));
        }
      }, 0);
    }

    readAsDataURL(blob: any) {
      setTimeout(() => {
        if (!blob) {
          if (this.onerror) this.onerror(new Error("Null blob passed to FileReader"));
          return;
        }

        if (typeof blob.arrayBuffer === "function") {
          blob.arrayBuffer()
            .then((buf: ArrayBuffer) => {
              const base64 = Buffer.from(buf).toString("base64");
              const url = `data:${blob.type || "application/octet-stream"};base64,${base64}`;
              this.result = url;
              if (this.onload) this.onload({ target: { result: url } });
              if (this.onloadend) this.onloadend({ target: { result: url } });
            })
            .catch((err: any) => {
              if (this.onerror) this.onerror(err);
            });
        } else {
          if (this.onerror) this.onerror(new Error("Unsupported blob format for data URL"));
        }
      }, 0);
    }
  }

  (global as any).FileReader = NodeFileReader;
}

// Now safely import our Three.js procedural code
import { buildOversizedShirtGroup } from "../src/features/shirt-configurator/procedural/shirt";
import { exportShirtToGLB } from "../src/features/shirt-configurator/procedural/export";

async function main() {
  console.log("🚀 Starting Procedural 3D Oversized Shirt Generation with correct FileReader...");
  
  // 1. Generate the shirt group with exact requested measurements
  const shirtGroup = buildOversizedShirtGroup();
  
  console.log("📦 Modeling completed. Exporting to binary GLB format...");
  
  // 2. Convert to GLB ArrayBuffer
  const glbBuffer = await exportShirtToGLB(shirtGroup);
  
  // 3. Ensure public/ directory exists
  const publicDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  // 4. Save file to disk
  const destPath = path.join(publicDir, "model.glb");
  fs.writeFileSync(destPath, Buffer.from(glbBuffer));
  
  console.log(`✨ Success! High-fidelity 3D model generated and saved to: ${destPath}`);
}

main().catch((err) => {
  console.error("❌ Failed to generate procedural shirt:", err);
  process.exit(1);
});
