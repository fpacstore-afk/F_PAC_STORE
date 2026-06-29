import * as THREE from "three";
import { getFabricFold, getBezierPoint, getBezierTangent, getOrthonormalFrame } from "./utils";
import { ShirtMeasurements, ShirtZone } from "./types";

/**
 * Calculates the top boundary Y coordinate of the shirt body panel.
 * Handles the elliptical neck cutout and sloped shoulder lines.
 */
export function getTopY(x: number, isFront: boolean, measurements: ShirtMeasurements): number {
  const H = measurements.length; // e.g. 0.8
  const collarR = measurements.collarWidth / 2; // e.g. 0.09
  const halfW = measurements.width / 2; // e.g. 0.335

  const absX = Math.abs(x);

  if (absX < collarR) {
    // Inside neck cutout
    const ratio = absX / collarR;
    const neckDrop = isFront ? 0.12 : 0.03; // Front cutout dips more than back
    const dip = Math.sqrt(1 - ratio * ratio) * neckDrop;
    return H - dip;
  } else {
    // Sloped shoulder
    const shoulderWidth = halfW - collarR;
    const t = (absX - collarR) / shoulderWidth;
    const shoulderDrop = 0.08; // Shoulder slope drop (8 cm)
    return H - t * shoulderDrop;
  }
}

/**
 * Generates the front or back solid panel geometry with thickness and natural draping folds.
 */
export function buildBodyPanel(isFront: boolean, measurements: ShirtMeasurements): THREE.BufferGeometry {
  const cols = 40;
  const rows = 40;
  const halfW = measurements.width / 2;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vertexCount = (cols + 1) * (rows + 1);

  // Helper to evaluate vertex coordinates for outer shell
  const getOuterPoint = (u: number, v: number): { pos: THREE.Vector3; normal: THREE.Vector3 } => {
    const x = -halfW + u * measurements.width;
    const topY = getTopY(x, isFront, measurements);
    const y = v * topY;

    // Body curvature
    const depthScale = isFront ? 0.07 : -0.05;
    let z = Math.cos(u * Math.PI - Math.PI / 2) * depthScale * Math.sin(v * Math.PI);

    // Apply fabric folds (more pronounced in the middle & underarms, less at edges)
    const foldScale = 0.016;
    const foldVal = getFabricFold(x, y, z, 1.0) * foldScale * Math.sin(u * Math.PI) * (1 - v * 0.3);
    z += foldVal;

    const pos = new THREE.Vector3(x, y, z);

    // Estimate normals using central differences
    const eps = 0.005;
    const getPosRaw = (uVal: number, vVal: number) => {
      const px = -halfW + uVal * measurements.width;
      const pTopY = getTopY(px, isFront, measurements);
      const py = vVal * pTopY;
      let pz = Math.cos(uVal * Math.PI - Math.PI / 2) * depthScale * Math.sin(vVal * Math.PI);
      pz += getFabricFold(px, py, pz, 1.0) * foldScale * Math.sin(uVal * Math.PI) * (1 - vVal * 0.3);
      return new THREE.Vector3(px, py, pz);
    };

    const pU = getPosRaw(Math.min(1, u + eps), v);
    const pV = getPosRaw(u, Math.min(1, v + eps));
    const tangentU = new THREE.Vector3().subVectors(pU, pos).normalize();
    const tangentV = new THREE.Vector3().subVectors(pV, pos).normalize();
    const normal = new THREE.Vector3().crossVectors(tangentU, tangentV).normalize();

    if (!isFront) {
      normal.multiplyScalar(-1); // Back panel faces backward
    }

    return { pos, normal };
  };

  // 1. Generate Vertices (Outer Shell followed by Inner Shell)
  for (let s = 0; s < 2; s++) {
    // s = 0 (Outer shell), s = 1 (Inner shell)
    const sign = s === 0 ? 1 : -1;
    const thickness = measurements.thickness;

    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;

        const { pos, normal } = getOuterPoint(u, v);
        
        // Add hem thickness effect
        let tOffset = thickness;
        if (v < 0.05) {
          tOffset += 0.0015; // Raised bottom hem
        }

        const finalPos = s === 0 
          ? pos 
          : pos.clone().addScaledVector(normal, -tOffset);

        positions.push(finalPos.x, finalPos.y, finalPos.z);
        
        // Outer normal points out, inner normal points in
        const finalNorm = normal.clone().multiplyScalar(sign);
        normals.push(finalNorm.x, finalNorm.y, finalNorm.z);

        // UV mapping - perfect projection
        // Flip U for back panel to keep textures facing the right way
        const uvU = isFront ? u : 1 - u;
        uvs.push(uvU, v);
      }
    }
  }

  // 2. Generate Triangles for Outer and Inner Shells
  const getIndex = (shell: number, i: number, j: number) => {
    return shell * vertexCount + j * (cols + 1) + i;
  };

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      // Outer shell (Standard winding CCW)
      const oA = getIndex(0, i, j);
      const oB = getIndex(0, i + 1, j);
      const oC = getIndex(0, i, j + 1);
      const oD = getIndex(0, i + 1, j + 1);

      indices.push(oA, oC, oB);
      indices.push(oB, oC, oD);

      // Inner shell (Inverted winding CW for interior visibility)
      const iA = getIndex(1, i, j);
      const iB = getIndex(1, i + 1, j);
      const iC = getIndex(1, i, j + 1);
      const iD = getIndex(1, i + 1, j + 1);

      indices.push(iA, iB, iC);
      indices.push(iB, iD, iC);
    }
  }

  // 3. Bridge open borders to make a watertight manifold
  // A. Bottom Border (j = 0)
  for (let i = 0; i < cols; i++) {
    const o0 = getIndex(0, i, 0);
    const o1 = getIndex(0, i + 1, 0);
    const i0 = getIndex(1, i, 0);
    const i1 = getIndex(1, i + 1, 0);

    indices.push(o0, i0, o1);
    indices.push(o1, i0, i1);
  }

  // B. Left Border (i = 0)
  for (let j = 0; j < rows; j++) {
    const o0 = getIndex(0, 0, j);
    const o1 = getIndex(0, 0, j + 1);
    const i0 = getIndex(1, 0, j);
    const i1 = getIndex(1, 0, j + 1);

    indices.push(o0, o1, i0);
    indices.push(o1, i1, i0);
  }

  // C. Right Border (i = cols)
  for (let j = 0; j < rows; j++) {
    const o0 = getIndex(0, cols, j);
    const o1 = getIndex(0, cols, j + 1);
    const i0 = getIndex(1, cols, j);
    const i1 = getIndex(1, cols, j + 1);

    indices.push(o0, i0, o1);
    indices.push(o1, i0, i1);
  }

  // D. Top Border (j = rows) - bridge neckline and shoulders
  // Exclude neck opening from torso front/back if we want collar watertight.
  // Actually, bridging them creates a beautifully self-contained solid.
  for (let i = 0; i < cols; i++) {
    const o0 = getIndex(0, i, rows);
    const o1 = getIndex(0, i + 1, rows);
    const i0 = getIndex(1, i, rows);
    const i1 = getIndex(1, i + 1, rows);

    indices.push(o0, o1, i0);
    indices.push(o1, i1, i0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return geometry;
}

/**
 * Builds a curved, draped 3D sleeve cylinder using Bezier path extrusion and gravity sagging.
 */
export function buildSleeve(isLeft: boolean, measurements: ShirtMeasurements): THREE.BufferGeometry {
  const radialSegments = 32;
  const tubularSegments = 30;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const sideMultiplier = isLeft ? -1 : 1;

  // 1. Establish the Bezier path for the sleeve axis
  const shoulderY = getTopY(sideMultiplier * (measurements.width / 2), true, measurements) - 0.08;
  const startPt = new THREE.Vector3(sideMultiplier * (measurements.width / 2), shoulderY, 0);
  const midPt = new THREE.Vector3(sideMultiplier * (measurements.width / 2 + measurements.sleeveLength * 0.5), shoulderY - 0.04, 0);
  const endPt = new THREE.Vector3(sideMultiplier * (measurements.width / 2 + measurements.sleeveLength), shoulderY - 0.16, 0.02);

  const R_x = measurements.sleeveWidth / 2; // e.g. 0.115
  const R_z = R_x * 0.82; // Flattened slightly by gravity

  const vertexCount = (radialSegments + 1) * (tubularSegments + 1);

  // Generate outer and inner sleeve meshes
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    const thickness = measurements.thickness;

    for (let j = 0; j <= tubularSegments; j++) {
      const v = j / tubularSegments;

      // Calculate path frame
      const posCenter = getBezierPoint(startPt, midPt, endPt, v);
      const tangent = getBezierTangent(startPt, midPt, endPt, v);
      const { normal: dirN, binormal: dirB } = getOrthonormalFrame(tangent);

      // Raised cuff hem detail
      let extraThickness = 0;
      if (v > 0.92) {
        extraThickness = 0.0015;
      }

      for (let i = 0; i <= radialSegments; i++) {
        const u = i / radialSegments;
        const theta = u * 2 * Math.PI;

        // Circular ring coordinates
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Oval sleeve shape with gravity drop on lower half (sinT < 0)
        const localX = cosT * R_x;
        let localZ = sinT * R_z;

        if (sinT < 0) {
          localZ += sinT * 0.015 * Math.sin(v * Math.PI); // Sag downwards
        }

        // Add soft fabric folds inside the sleeve bend
        const foldVal = getFabricFold(localX, posCenter.y, localZ, 1.0) * 0.008 * (1 - v) * Math.sin(theta);
        localZ += foldVal;

        // Map to 3D world space
        const pOuter = posCenter.clone()
          .addScaledVector(dirN, localX)
          .addScaledVector(dirB, localZ);

        // Vector pointing outwards from the sleeve center
        const radialVector = new THREE.Vector3().subVectors(pOuter, posCenter).normalize();

        const pFinal = s === 0 
          ? pOuter 
          : pOuter.clone().addScaledVector(radialVector, -(thickness + extraThickness));

        positions.push(pFinal.x, pFinal.y, pFinal.z);

        const normalVector = radialVector.clone().multiplyScalar(sign);
        normals.push(normalVector.x, normalVector.y, normalVector.z);

        // UV coordinates
        uvs.push(u, v);
      }
    }
  }

  // Generate faces
  const getSleeveIndex = (shell: number, r: number, t: number) => {
    return shell * vertexCount + t * (radialSegments + 1) + r;
  };

  for (let j = 0; j < tubularSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      // Outer sleeve
      const oA = getSleeveIndex(0, i, j);
      const oB = getSleeveIndex(0, i + 1, j);
      const oC = getSleeveIndex(0, i, j + 1);
      const oD = getSleeveIndex(0, i + 1, j + 1);

      indices.push(oA, oC, oB);
      indices.push(oB, oC, oD);

      // Inner sleeve (Reversed winding)
      const iA = getSleeveIndex(1, i, j);
      const iB = getSleeveIndex(1, i + 1, j);
      const iC = getSleeveIndex(1, i, j + 1);
      const iD = getSleeveIndex(1, i + 1, j + 1);

      indices.push(iA, iB, iC);
      indices.push(iB, iD, iC);
    }
  }

  // Bridge at shoulder seam (t = 0)
  for (let i = 0; i < radialSegments; i++) {
    const o0 = getSleeveIndex(0, i, 0);
    const o1 = getSleeveIndex(0, i + 1, 0);
    const i0 = getSleeveIndex(1, i, 0);
    const i1 = getSleeveIndex(1, i + 1, 0);

    indices.push(o0, o1, i0);
    indices.push(o1, i1, i0);
  }

  // Bridge at sleeve cuff (t = tubularSegments)
  for (let i = 0; i < radialSegments; i++) {
    const o0 = getSleeveIndex(0, i, tubularSegments);
    const o1 = getSleeveIndex(0, i + 1, tubularSegments);
    const i0 = getSleeveIndex(1, i, tubularSegments);
    const i1 = getSleeveIndex(1, i + 1, tubularSegments);

    indices.push(o0, i0, o1);
    indices.push(o1, i0, i1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return geometry;
}

/**
 * Builds a realistic ribbed circular neck collar with customizable ribs (gola canelada) and thickness.
 */
export function buildCollar(measurements: ShirtMeasurements): THREE.BufferGeometry {
  const segments = 64;
  const ribHeight = 0.022; // 2.2 cm ribbed collar height

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const collarRadius = measurements.collarWidth / 2; // e.g. 0.09
  const vertexCount = (segments + 1) * 2;

  // Outer collar loop and inner collar loop
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    const thickness = measurements.thickness;

    for (let j = 0; j <= 1; j++) {
      const yOffset = j * ribHeight;

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const angle = u * 2 * Math.PI;

        // Trace neckline coordinates
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Collar elliptical posture
        const rx = collarRadius;
        const rz = collarRadius * 0.94; // slightly oval

        // Beautiful ribbed extrusion pattern (Gola Canelada)
        const ribAmp = 0.0016;
        const ribFreq = 54;
        const ribMod = 1.0 + ribAmp * Math.sin(angle * ribFreq);

        const bx = cosA * rx * ribMod;
        const bz = sinA * rz * ribMod;

        // Front drops more, back drops less
        const isCollarFront = sinA < 0;
        const baseDrop = isCollarFront ? 0.12 : 0.03;
        const collarY = measurements.length - Math.sqrt(1 - (bx/rx)*(bx/rx)) * baseDrop + yOffset - 0.015;

        // Normal points outward from center
        const normalVec = new THREE.Vector3(cosA, 0.1, sinA).normalize();

        const pFinal = s === 0
          ? new THREE.Vector3(bx, collarY, bz)
          : new THREE.Vector3(bx, collarY, bz).addScaledVector(normalVec, -thickness);

        positions.push(pFinal.x, pFinal.y, pFinal.z);

        const normFinal = normalVec.clone().multiplyScalar(sign);
        normals.push(normFinal.x, normFinal.y, normFinal.z);

        uvs.push(u, j);
      }
    }
  }

  // Generate faces
  const getCollarIndex = (shell: number, r: number, h: number) => {
    return shell * vertexCount + h * (segments + 1) + r;
  };

  for (let i = 0; i < segments; i++) {
    // Outer loop
    const oA = getCollarIndex(0, i, 0);
    const oB = getCollarIndex(0, i + 1, 0);
    const oC = getCollarIndex(0, i, 1);
    const oD = getCollarIndex(0, i + 1, 1);

    indices.push(oA, oC, oB);
    indices.push(oB, oC, oD);

    // Inner loop
    const iA = getCollarIndex(1, i, 0);
    const iB = getCollarIndex(1, i + 1, 0);
    const iC = getCollarIndex(1, i, 1);
    const iD = getCollarIndex(1, i + 1, 1);

    indices.push(iA, iB, iC);
    indices.push(iB, iD, iC);
  }

  // Bridge at collar bottom seam (h = 0)
  for (let i = 0; i < segments; i++) {
    const o0 = getCollarIndex(0, i, 0);
    const o1 = getCollarIndex(0, i + 1, 0);
    const i0 = getCollarIndex(1, i, 0);
    const i1 = getCollarIndex(1, i + 1, 0);

    indices.push(o0, o1, i0);
    indices.push(o1, i1, i0);
  }

  // Bridge at collar top ridge (h = 1)
  for (let i = 0; i < segments; i++) {
    const o0 = getCollarIndex(0, i, 1);
    const o1 = getCollarIndex(0, i + 1, 1);
    const i0 = getCollarIndex(1, i, 1);
    const i1 = getCollarIndex(1, i + 1, 1);

    indices.push(o0, i0, o1);
    indices.push(o1, i0, i1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return geometry;
}
