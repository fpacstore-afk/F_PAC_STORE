import * as THREE from "three";
import { ShirtMeasurements } from "./types";

/**
 * Calculates the exact 3D coordinates of the collar boundary loop (neck cutout).
 * Ensures mathematical synchronization between the torso cutout and collar base.
 */
export function getNeckCoordinate(angle: number, isOuter: boolean, measurements: ShirtMeasurements): THREE.Vector3 {
  const H = measurements.length;
  const collarR = measurements.collarWidth / 2;
  const collarR_z = collarR * 0.95;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const isFront = sinA >= 0;

  const bx = cosA * collarR;
  const bz = sinA * collarR_z;

  const ratio = Math.abs(bx) / collarR;
  const dipAmount = isFront ? 0.085 : 0.025;
  const dip = Math.sqrt(Math.max(0, 1 - ratio * ratio)) * dipAmount;
  const y = H - dip;

  const pos = new THREE.Vector3(bx, y, bz);

  // Ribbed collar texture groove modulation (Gola Canelada)
  const ribFreq = 72;
  const ribAmp = isOuter ? 0.0022 : 0.0;
  const ribMod = 1.0 + ribAmp * Math.sin(angle * ribFreq);
  pos.x *= ribMod;
  pos.z *= ribMod;

  if (!isOuter) {
    const thickness = measurements.thickness + 0.0018; // Ribbed collar is thicker
    const normalVec = new THREE.Vector3(cosA, 0.1, sinA).normalize();
    pos.addScaledVector(normalVec, -thickness);
  }

  return pos;
}

/**
 * Calculates the exact 3D coordinates of the armhole boundary loop (cava).
 * Ensures mathematical synchronization between the torso sides and the sleeve base.
 */
export function getArmholeCoordinate(
  theta: number,
  isLeft: boolean,
  isOuter: boolean,
  measurements: ShirtMeasurements
): THREE.Vector3 {
  const Ry = measurements.sleeveWidth / 2;
  const Rz = Ry * 0.88;
  const y_shoulder_tip = measurements.length - 0.07;
  const armholeCenterY = y_shoulder_tip - Ry;
  const sideMultiplier = isLeft ? -1 : 1;
  const halfW = measurements.width / 2;
  const halfD = measurements.width * 0.165;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const y = armholeCenterY + cosT * Ry;
  const z = sinT * Rz;

  // Project onto the curved torso elliptical cylinder
  const x = sideMultiplier * halfW * Math.sqrt(Math.max(0, 1 - Math.pow(z / halfD, 2)));

  const pos = new THREE.Vector3(x, y, z);

  // Apply volumetric offset for inner shell thickness
  if (!isOuter) {
    const normalVec = new THREE.Vector3(
      sideMultiplier * Math.sqrt(Math.max(0, 1 - Math.pow(z / halfD, 2))),
      0,
      z / halfD
    ).normalize();
    pos.addScaledVector(normalVec, -measurements.thickness);
  }

  return pos;
}

/**
 * Calculates the top boundary Y coordinate of the shoulder slope (used for simple calculations).
 */
export function getTopY(x: number, isFront: boolean, measurements: ShirtMeasurements): number {
  const H = measurements.length;
  const collarR = measurements.collarWidth / 2;
  const halfW = measurements.width / 2;
  const absX = Math.abs(x);

  if (absX < collarR) {
    const ratio = absX / collarR;
    const neckDrop = isFront ? 0.085 : 0.025;
    const dip = Math.sqrt(Math.max(0, 1 - ratio * ratio)) * neckDrop;
    return H - dip;
  } else {
    const t = (absX - collarR) / (halfW - collarR);
    const shoulderDrop = t * 0.07;
    return H - shoulderDrop;
  }
}

/**
 * Generates the front or back solid panel geometry with realistic volumetric thickness and natural draping folds.
 * Features a high-precision snapping algorithm that aligns torso boundary vertices exactly with neck and armhole openings.
 */
export function buildBodyPanel(isFront: boolean, measurements: ShirtMeasurements): THREE.BufferGeometry {
  const cols = 60;
  const rows = 60;
  const halfW = measurements.width / 2;
  const halfD = measurements.width * 0.165;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const isInsideArmholeArray: boolean[] = [];

  const vertexCount = (cols + 1) * (rows + 1);

  // Evaluates a single 3D coordinate point on the torso panel
  const getPoint = (i: number, j: number, isOuter: boolean): { pos: THREE.Vector3; isInsideArmhole: boolean } => {
    const u = i / cols;
    const v = j / rows;
    const collarR = measurements.collarWidth / 2;

    let x = 0;
    let y_top = measurements.length;
    let isNeck = false;
    let alpha = 0;

    // Fixed column layout: 0-20 left shoulder, 20-40 neck cutout, 40-60 right shoulder
    if (i <= 20) {
      const t = i / 20;
      x = -halfW + t * (halfW - collarR);
      y_top = measurements.length - (1 - t) * 0.07;
    } else if (i < 40) {
      isNeck = true;
      const t = (i - 20) / 20;
      alpha = isFront ? Math.PI - t * Math.PI : Math.PI + t * Math.PI;
      const neckPoint = getNeckCoordinate(alpha, isOuter, measurements);
      x = neckPoint.x;
      y_top = neckPoint.y;
    } else {
      const t = (i - 40) / 20;
      x = collarR + t * (halfW - collarR);
      y_top = measurements.length - t * 0.07;
    }

    let y = v * y_top;

    // Evaluate torso depth profile (elliptical cylinder)
    const theta = Math.asin(Math.max(-0.999, Math.min(0.999, x / halfW)));
    const z_base = Math.cos(theta) * halfD * (isFront ? 1 : -1);

    let z_profile = 1.0;
    const absX = Math.abs(x);
    if (absX >= collarR) {
      z_profile = 1.0 - Math.pow(v, 2);
    } else {
      const ratio = absX / collarR;
      z_profile = 1.0 - Math.pow(v, 2) * ratio;
    }

    let z = z_base * z_profile;

    // Streetwear cotton drapes and ripples
    const fold1 = Math.sin(u * Math.PI * 3.5 + v * Math.PI * 2.0) * 0.012;
    const fold2 = Math.cos(u * Math.PI * 1.8 - v * Math.PI * 3.2) * 0.006;
    const foldIntensity = Math.sin(v * Math.PI) * (1.0 - 0.3 * v);
    z += (fold1 + fold2) * foldIntensity * Math.cos(theta);

    // Bottom hem seam bulge
    if (v < 0.05) {
      z += Math.sin((v / 0.05) * Math.PI) * 0.0025 * (isFront ? 1 : -1);
    }

    const pos = new THREE.Vector3(x, y, z);

    // For neck cutout top-row, clamp exactly to mathematical neck opening
    if (isNeck && j === rows) {
      const neckPoint = getNeckCoordinate(alpha, isOuter, measurements);
      return { pos: neckPoint, isInsideArmhole: false };
    }

    // High-precision armhole boundary snapping
    const Ry = measurements.sleeveWidth / 2;
    const Rz = Ry * 0.88;
    const y_shoulder_tip = measurements.length - 0.07;
    const armholeCenterY = y_shoulder_tip - Ry;

    const dist_L = Math.pow((y - armholeCenterY) / Ry, 2) + Math.pow(z / Rz, 2);
    const dist_R = Math.pow((y - armholeCenterY) / Ry, 2) + Math.pow(z / Rz, 2);

    let isInsideArmhole = false;

    if (x < 0 && dist_L < 1.0) {
      isInsideArmhole = true;
      const scale = 1.0 / Math.sqrt(dist_L);
      const snappedY = armholeCenterY + (y - armholeCenterY) * scale;
      const snappedZ = z * scale;
      const snappedTheta = Math.atan2(snappedZ / Rz, (snappedY - armholeCenterY) / Ry);
      const snappedPoint = getArmholeCoordinate(snappedTheta, true, isOuter, measurements);
      pos.copy(snappedPoint);
    } else if (x > 0 && dist_R < 1.0) {
      isInsideArmhole = true;
      const scale = 1.0 / Math.sqrt(dist_R);
      const snappedY = armholeCenterY + (y - armholeCenterY) * scale;
      const snappedZ = z * scale;
      const snappedTheta = Math.atan2(snappedZ / Rz, (snappedY - armholeCenterY) / Ry);
      const snappedPoint = getArmholeCoordinate(snappedTheta, false, isOuter, measurements);
      pos.copy(snappedPoint);
    }

    if (!isOuter && !isInsideArmhole) {
      const normalVec = new THREE.Vector3(
        Math.sin(theta) * (isFront ? 1 : -1),
        0,
        Math.cos(theta) * (isFront ? 1 : -1)
      ).normalize();
      pos.addScaledVector(normalVec, -measurements.thickness);
    }

    return { pos, isInsideArmhole };
  };

  // 1. Generate Vertices (Outer Shell followed by Inner Shell)
  for (let s = 0; s < 2; s++) {
    const isOuter = s === 0;

    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const { pos, isInsideArmhole } = getPoint(i, j, isOuter);

        positions.push(pos.x, pos.y, pos.z);
        isInsideArmholeArray.push(isInsideArmhole);

        const uvU = isFront ? u : 1 - u;
        uvs.push(uvU, j / rows);
      }
    }
  }

  // 2. Generate Triangles (cutting out armholes by skipping internal triangles)
  const getIndex = (shell: number, i: number, j: number) => {
    return shell * vertexCount + j * (cols + 1) + i;
  };

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      // Outer shell
      const oA = getIndex(0, i, j);
      const oB = getIndex(0, i + 1, j);
      const oC = getIndex(0, i, j + 1);
      const oD = getIndex(0, i + 1, j + 1);

      // Skip face if all vertices are inside the armholes
      const oA_inside = isInsideArmholeArray[oA];
      const oB_inside = isInsideArmholeArray[oB];
      const oC_inside = isInsideArmholeArray[oC];
      const oD_inside = isInsideArmholeArray[oD];

      if (!(oA_inside && oB_inside && oC_inside && oD_inside)) {
        if (isFront) {
          indices.push(oA, oC, oB);
          indices.push(oB, oC, oD);
        } else {
          indices.push(oA, oB, oC);
          indices.push(oB, oD, oC);
        }
      }

      // Inner shell
      const iA = getIndex(1, i, j);
      const iB = getIndex(1, i + 1, j);
      const iC = getIndex(1, i, j + 1);
      const iD = getIndex(1, i + 1, j + 1);

      const iA_inside = isInsideArmholeArray[iA];
      const iB_inside = isInsideArmholeArray[iB];
      const iC_inside = isInsideArmholeArray[iC];
      const iD_inside = isInsideArmholeArray[iD];

      if (!(iA_inside && iB_inside && iC_inside && iD_inside)) {
        if (isFront) {
          indices.push(iA, iB, iC);
          indices.push(iB, iD, iC);
        } else {
          indices.push(iA, iC, iB);
          indices.push(iB, iC, iD);
        }
      }
    }
  }

  // 3. Bridge bottom hem and side seams
  // Bottom Hem
  for (let i = 0; i < cols; i++) {
    const o0 = getIndex(0, i, 0);
    const o1 = getIndex(0, i + 1, 0);
    const i0 = getIndex(1, i, 0);
    const i1 = getIndex(1, i + 1, 0);

    if (isFront) {
      indices.push(o0, i0, o1);
      indices.push(o1, i0, i1);
    } else {
      indices.push(o0, o1, i0);
      indices.push(o1, i1, i0);
    }
  }

  // Left Side Seam
  for (let j = 0; j < rows; j++) {
    const o0 = getIndex(0, 0, j);
    const o1 = getIndex(0, 0, j + 1);
    const i0 = getIndex(1, 0, j);
    const i1 = getIndex(1, 0, j + 1);

    if (!isInsideArmholeArray[o0] && !isInsideArmholeArray[o1]) {
      if (isFront) {
        indices.push(o0, o1, i0);
        indices.push(o1, i1, i0);
      } else {
        indices.push(o0, i0, o1);
        indices.push(o1, i0, i1);
      }
    }
  }

  // Right Side Seam
  for (let j = 0; j < rows; j++) {
    const o0 = getIndex(0, cols, j);
    const o1 = getIndex(0, cols, j + 1);
    const i0 = getIndex(1, cols, j);
    const i1 = getIndex(1, cols, j + 1);

    if (!isInsideArmholeArray[o0] && !isInsideArmholeArray[o1]) {
      if (isFront) {
        indices.push(o0, i0, o1);
        indices.push(o1, i0, i1);
      } else {
        indices.push(o0, o1, i0);
        indices.push(o1, i1, i0);
      }
    }
  }

  // Shoulder and Neck Top Bridge
  for (let i = 0; i < cols; i++) {
    const o0 = getIndex(0, i, rows);
    const o1 = getIndex(0, i + 1, rows);
    const i0 = getIndex(1, i, rows);
    const i1 = getIndex(1, i + 1, rows);

    if (isFront) {
      indices.push(o0, o1, i0);
      indices.push(o1, i1, i0);
    } else {
      indices.push(o0, i0, o1);
      indices.push(o1, i0, i1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds a beautifully swept, naturally angled, and draped sleeve cylinder.
 * Merges seamlessly into the torso armholes by blending the first slice of vertices.
 */
export function buildSleeve(isLeft: boolean, measurements: ShirtMeasurements): THREE.BufferGeometry {
  const radialSegments = 45;
  const tubularSegments = 40;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const sideMultiplier = isLeft ? -1 : 1;
  const halfW = measurements.width / 2;

  const Ry = measurements.sleeveWidth / 2;
  const Rz = Ry * 0.88;

  const y_shoulder_tip = measurements.length - 0.07;
  const armholeCenterY = y_shoulder_tip - measurements.sleeveWidth / 2;

  const angle = (32 * Math.PI) / 180;
  const sleeveLength = measurements.sleeveLength;

  const vertexCount = (radialSegments + 1) * (tubularSegments + 1);

  for (let s = 0; s < 2; s++) {
    const isOuter = s === 0;

    for (let j = 0; j <= tubularSegments; j++) {
      const v = j / tubularSegments;
      const currAngle = angle * v;

      // Sleeve sweep coordinates
      const cx = sideMultiplier * (halfW - 0.01 + v * sleeveLength * Math.cos(currAngle));
      const cy = armholeCenterY - v * sleeveLength * Math.sin(currAngle) - 0.04 * Math.pow(v, 2);

      const axisY = new THREE.Vector3(sideMultiplier * Math.sin(currAngle), Math.cos(currAngle), 0);
      const axisZ = new THREE.Vector3(0, 0, 1);

      const extraThickness = v > 0.90 ? 0.002 : 0;

      for (let i = 0; i <= radialSegments; i++) {
        const u = i / radialSegments;
        const theta = u * 2 * Math.PI;

        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        let localY = cosT * Ry;
        let localZ = sinT * Rz;

        // Gravity sag
        if (sinT < 0) {
          localY += sinT * 0.015 * Math.sin(v * Math.PI);
        }

        // Tactile wrinkles
        const wrinkleFreq = 4.2;
        const wrinkleAmp = 0.012;
        const wrinkle = Math.sin(v * Math.PI * wrinkleFreq + theta * 1.5) * wrinkleAmp * Math.sin(v * Math.PI);
        localZ += wrinkle;

        // Free-sweep coordinate projection
        const pOuter_sweep = new THREE.Vector3(cx, cy, 0)
          .addScaledVector(axisY, localY)
          .addScaledVector(axisZ, localZ);

        // Calculate mathematical torso boundary point at v=0
        const p_base = getArmholeCoordinate(theta, isLeft, isOuter, measurements);

        // Sweep center coordinate at v=0 (for blending reference)
        const cx0 = sideMultiplier * (halfW - 0.01);
        const cy0 = armholeCenterY;
        const pOuter_sweep_at_v0 = new THREE.Vector3(cx0, cy0, 0)
          .addScaledVector(new THREE.Vector3(0, 1, 0), localY)
          .addScaledVector(axisZ, localZ);

        // Linear interpolation blend near the shoulder joint to avoid cracks
        const blend = Math.max(0, 1 - v / 0.25);
        const finalPos = pOuter_sweep.clone();
        finalPos.x += (p_base.x - pOuter_sweep_at_v0.x) * blend;
        finalPos.y += (p_base.y - pOuter_sweep_at_v0.y) * blend;
        finalPos.z += (p_base.z - pOuter_sweep_at_v0.z) * blend;

        // Thickness inward offset
        if (!isOuter) {
          const radialVec = new THREE.Vector3().subVectors(finalPos, new THREE.Vector3(cx, cy, 0)).normalize();
          finalPos.addScaledVector(radialVec, -(measurements.thickness + extraThickness));
        }

        positions.push(finalPos.x, finalPos.y, finalPos.z);
        uvs.push(u, v);
      }
    }
  }

  const getSleeveIndex = (shell: number, r: number, t: number) => {
    return shell * vertexCount + t * (radialSegments + 1) + r;
  };

  for (let j = 0; j < tubularSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const oA = getSleeveIndex(0, i, j);
      const oB = getSleeveIndex(0, i + 1, j);
      const oC = getSleeveIndex(0, i, j + 1);
      const oD = getSleeveIndex(0, i + 1, j + 1);

      if (isLeft) {
        indices.push(oA, oC, oB);
        indices.push(oB, oC, oD);
      } else {
        indices.push(oA, oB, oC);
        indices.push(oB, oD, oC);
      }

      const iA = getSleeveIndex(1, i, j);
      const iB = getSleeveIndex(1, i + 1, j);
      const iC = getSleeveIndex(1, i, j + 1);
      const iD = getSleeveIndex(1, i + 1, j + 1);

      if (isLeft) {
        indices.push(iA, iB, iC);
        indices.push(iB, iD, iC);
      } else {
        indices.push(iA, iC, iB);
        indices.push(iB, iC, iD);
      }
    }
  }

  // Bridge sleeve joint and cuff openings
  for (let i = 0; i < radialSegments; i++) {
    const o0 = getSleeveIndex(0, i, 0);
    const o1 = getSleeveIndex(0, i + 1, 0);
    const i0 = getSleeveIndex(1, i, 0);
    const i1 = getSleeveIndex(1, i + 1, 0);

    if (isLeft) {
      indices.push(o0, o1, i0);
      indices.push(o1, i1, i0);
    } else {
      indices.push(o0, i0, o1);
      indices.push(o1, i0, i1);
    }
  }

  for (let i = 0; i < radialSegments; i++) {
    const o0 = getSleeveIndex(0, i, tubularSegments);
    const o1 = getSleeveIndex(0, i + 1, tubularSegments);
    const i0 = getSleeveIndex(1, i, tubularSegments);
    const i1 = getSleeveIndex(1, i + 1, tubularSegments);

    if (isLeft) {
      indices.push(o0, i0, o1);
      indices.push(o1, i0, i1);
    } else {
      indices.push(o0, o1, i0);
      indices.push(o1, i1, i0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds a realistic thick ribbed crewneck collar wrapping the neck cutout loop.
 * Integrates flawlessly with the torso using 40 segments to align vertex-for-vertex.
 */
export function buildCollar(measurements: ShirtMeasurements): THREE.BufferGeometry {
  const segments = 40; // High precision, aligned with neck cutout loop
  const ribHeight = 0.026;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vertexCount = (segments + 1) * 2;

  for (let s = 0; s < 2; s++) {
    const isOuter = s === 0;

    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const angle = Math.PI + u * 2 * Math.PI;

        const pos_base = getNeckCoordinate(angle, isOuter, measurements);
        const finalPos = pos_base.clone();

        // Scale collar slightly inward at the top opening for snug fit
        if (j === 1) {
          finalPos.x *= 0.92;
          finalPos.z *= 0.92;
          finalPos.y += ribHeight;
        }

        positions.push(finalPos.x, finalPos.y, finalPos.z);
        uvs.push(u, j);
      }
    }
  }

  const getCollarIndex = (shell: number, r: number, h: number) => {
    return shell * vertexCount + h * (segments + 1) + r;
  };

  for (let i = 0; i < segments; i++) {
    const oA = getCollarIndex(0, i, 0);
    const oB = getCollarIndex(0, i + 1, 0);
    const oC = getCollarIndex(0, i, 1);
    const oD = getCollarIndex(0, i + 1, 1);

    indices.push(oA, oC, oB);
    indices.push(oB, oC, oD);

    const iA = getCollarIndex(1, i, 0);
    const iB = getCollarIndex(1, i + 1, 0);
    const iC = getCollarIndex(1, i, 1);
    const iD = getCollarIndex(1, i + 1, 1);

    indices.push(iA, iB, iC);
    indices.push(iB, iD, iC);
  }

  // Bridge top and bottom edges
  for (let i = 0; i < segments; i++) {
    const o0 = getCollarIndex(0, i, 0);
    const o1 = getCollarIndex(0, i + 1, 0);
    const i0 = getCollarIndex(1, i, 0);
    const i1 = getCollarIndex(1, i + 1, 0);

    indices.push(o0, o1, i0);
    indices.push(o1, i1, i0);
  }

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
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds a surface-aligned print plane geometry.
 * Floats exactly 0.8mm above the fabric surface and curves flawlessly to follow
 * the 3D drapes and volumetric folds of the body or sleeves.
 */
export function buildPrintPlane(zone: "front" | "back" | "left" | "right", measurements: ShirtMeasurements): THREE.BufferGeometry {
  const cols = 26;
  const rows = 26;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfW = measurements.width / 2;
  const halfD = measurements.width * 0.165;
  const collarR = measurements.collarWidth / 2;

  let w = 0.32;
  let h = 0.40;
  let centerY = measurements.length * 0.58;

  if (zone === "left" || zone === "right") {
    w = 0.16;
    h = 0.16;
    centerY = (measurements.length - 0.09) - measurements.sleeveWidth * 0.9;
  }

  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;

      let x = 0;
      let y = 0;
      let z = 0;

      if (zone === "front" || zone === "back") {
        const isFront = zone === "front";
        const x_print = -w / 2 + u * w;
        const y_print = centerY - h / 2 + v * h;

        x = x_print;
        y = y_print;
        const absX = Math.abs(x);

        let y_top = measurements.length;
        if (absX < collarR) {
          const ratio = absX / collarR;
          const neckDrop = isFront ? 0.085 : 0.025;
          const dip = Math.sqrt(Math.max(0, 1 - ratio * ratio)) * neckDrop;
          y_top = measurements.length - dip;
        } else {
          const t = (absX - collarR) / (halfW - collarR);
          const shoulderDrop = t * 0.07;
          y_top = measurements.length - shoulderDrop;
        }

        const v_body = y_print / y_top;

        const theta = Math.asin(Math.max(-0.99, Math.min(0.99, x / halfW)));
        const z_base = Math.cos(theta) * halfD * (isFront ? 1 : -1);

        let z_profile = 1.0;
        if (absX >= collarR) {
          z_profile = 1.0 - Math.pow(v_body, 2);
        } else {
          const ratio = absX / collarR;
          z_profile = 1.0 - Math.pow(v_body, 2) * ratio;
        }

        z = z_base * z_profile;

        // Apply matching fabric folds
        const u_body = theta / Math.PI + 0.5;
        const fold1 = Math.sin(u_body * Math.PI * 3.5 + v_body * Math.PI * 2.0) * 0.012;
        const fold2 = Math.cos(u_body * Math.PI * 1.8 - v_body * Math.PI * 3.2) * 0.006;
        const foldIntensity = Math.sin(v_body * Math.PI) * (1.0 - 0.3 * v_body);
        z += (fold1 + fold2) * foldIntensity * Math.cos(theta);

        // Volumetric 0.8mm hover offset to avoid z-fighting
        const offsetMultiplier = isFront ? 1 : -1;
        z += offsetMultiplier * 0.0008;
      } else {
        // Sleeve Print Plane
        const isLeft = zone === "left";
        const sideMultiplier = isLeft ? -1 : 1;
        const y_shoulder_tip = measurements.length - 0.07;
        const armholeCenterY = y_shoulder_tip - measurements.sleeveWidth / 2;
        const angleVal = (32 * Math.PI) / 180;
        const sleeveLength = measurements.sleeveLength;

        // Locate print on sleeve length
        const sleeveV_start = 0.25;
        const sleeveV_end = 0.65;
        const sleeveV = sleeveV_start + v * (sleeveV_end - sleeveV_start);

        // Wrap print around the outer upper curve of sleeve
        const theta_start = -Math.PI / 4;
        const theta_end = Math.PI / 4;
        const theta = theta_start + u * (theta_end - theta_start);

        const currAngle = angleVal * sleeveV;
        const cx = sideMultiplier * (halfW - 0.01 + sleeveV * sleeveLength * Math.cos(currAngle));
        const cy = armholeCenterY - sleeveV * sleeveLength * Math.sin(currAngle) - 0.04 * Math.pow(sleeveV, 2);

        const axisY = new THREE.Vector3(sideMultiplier * Math.sin(currAngle), Math.cos(currAngle), 0);
        const axisZ = new THREE.Vector3(0, 0, 1);

        const Ry = measurements.sleeveWidth / 2;
        const Rz = Ry * 0.88;

        let localY = Math.cos(theta) * Ry;
        let localZ = Math.sin(theta) * Rz;

        // Apply matching sleeve wrinkles
        const wrinkle = Math.sin(sleeveV * Math.PI * 4.2 + theta * 1.5) * 0.012 * Math.sin(sleeveV * Math.PI);
        localZ += wrinkle;

        const pOuter = new THREE.Vector3(cx, cy, 0)
          .addScaledVector(axisY, localY)
          .addScaledVector(axisZ, localZ);

        x = pOuter.x;
        y = pOuter.y;
        z = pOuter.z;

        // Sleeve outward normal offset
        const normalVec = new THREE.Vector3().addScaledVector(axisY, Math.cos(theta)).addScaledVector(axisZ, Math.sin(theta)).normalize();
        x += normalVec.x * 0.0008;
        y += normalVec.y * 0.0008;
        z += normalVec.z * 0.0008;
      }

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  // Generate faces
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = j * (cols + 1) + i + 1;
      const c = (j + 1) * (cols + 1) + i;
      const d = (j + 1) * (cols + 1) + i + 1;

      if (zone === "back" || zone === "left") {
        indices.push(a, b, c);
        indices.push(b, d, c);
      } else {
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Merges multiple geometries, welds overlapping vertices by position, and calculates perfectly
 * averaged, continuous smooth normals across welded boundaries to ensure seamless lighting shading.
 */
export function mergeAndWeldGeometries(
  geoms: THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();

  let totalVertices = 0;
  let totalIndices = 0;

  for (const geom of geoms) {
    totalVertices += geom.getAttribute("position").count;
    totalIndices += geom.getIndex()?.count ?? 0;
  }

  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;

  for (const geom of geoms) {
    const posAttr = geom.getAttribute("position");
    const uvAttr = geom.getAttribute("uv");
    const indexAttr = geom.getIndex();

    positions.set(posAttr.array as Float32Array, vertexOffset * 3);
    uvs.set(uvAttr.array as Float32Array, vertexOffset * 2);

    if (indexAttr) {
      const idxArr = indexAttr.array;
      for (let i = 0; i < idxArr.length; i++) {
        indices[indexOffset + i] = idxArr[i] + vertexOffset;
      }
      indexOffset += idxArr.length;
    }

    vertexOffset += posAttr.count;
  }

  // Group vertices that share the same 3D position (within a 1.2 cm threshold)
  const threshold = 0.012;
  const thresholdSq = threshold * threshold;

  const positionGroups: { [key: string]: number[] } = {};
  for (let i = 0; i < totalVertices; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    const key = `${Math.round(x * 85)},${Math.round(y * 85)},${Math.round(z * 85)}`;
    if (!positionGroups[key]) {
      positionGroups[key] = [];
    }
    positionGroups[key].push(i);
  }

  const vertexToGroupRepresentative: number[] = new Array(totalVertices);

  for (const key in positionGroups) {
    const indicesInCell = positionGroups[key];
    const visited = new Set<number>();

    for (let i = 0; i < indicesInCell.length; i++) {
      const idxA = indicesInCell[i];
      if (visited.has(idxA)) continue;

      const cluster: number[] = [idxA];
      visited.add(idxA);

      const ax = positions[idxA * 3];
      const ay = positions[idxA * 3 + 1];
      const az = positions[idxA * 3 + 2];

      for (let j = i + 1; j < indicesInCell.length; j++) {
        const idxB = indicesInCell[j];
        if (visited.has(idxB)) continue;

        const bx = positions[idxB * 3];
        const by = positions[idxB * 3 + 1];
        const bz = positions[idxB * 3 + 2];

        const distSq = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
        if (distSq < thresholdSq) {
          cluster.push(idxB);
          visited.add(idxB);
        }
      }

      let sumX = 0, sumY = 0, sumZ = 0;
      for (const idx of cluster) {
        sumX += positions[idx * 3];
        sumY += positions[idx * 3 + 1];
        sumZ += positions[idx * 3 + 2];
      }
      const avgX = sumX / cluster.length;
      const avgY = sumY / cluster.length;
      const avgZ = sumZ / cluster.length;

      for (const idx of cluster) {
        vertexToGroupRepresentative[idx] = idxA;
        positions[idx * 3] = avgX;
        positions[idx * 3 + 1] = avgY;
        positions[idx * 3 + 2] = avgZ;
      }
    }
  }

  // Calculate averaged smooth normals based on face normals sharing the SAME representative
  const normals = new Float32Array(totalVertices * 3);
  const repNormals: { [repIdx: number]: THREE.Vector3 } = {};

  for (let i = 0; i < totalVertices; i++) {
    const rep = vertexToGroupRepresentative[i];
    if (!repNormals[rep]) {
      repNormals[rep] = new THREE.Vector3();
    }
  }

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    const p0 = new THREE.Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
    const p1 = new THREE.Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
    const p2 = new THREE.Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);

    const edge1 = new THREE.Vector3().subVectors(p1, p0);
    const edge2 = new THREE.Vector3().subVectors(p2, p0);
    const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2);

    const r0 = vertexToGroupRepresentative[i0];
    const r1 = vertexToGroupRepresentative[i1];
    const r2 = vertexToGroupRepresentative[i2];

    repNormals[r0].add(faceNormal);
    repNormals[r1].add(faceNormal);
    repNormals[r2].add(faceNormal);
  }

  for (let i = 0; i < totalVertices; i++) {
    const rep = vertexToGroupRepresentative[i];
    const n = repNormals[rep].clone().normalize();
    normals[i * 3] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
  }

  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));

  return merged;
}

