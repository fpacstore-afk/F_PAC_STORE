/// <reference types="@react-three/fiber" />
/// <reference types="vite/client" />

import * as React from 'react';

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      spotLight: any;
      hemisphereLight: any;
      group: any;
      mesh: any;
      planeGeometry: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      torusGeometry: any;
      cylinderGeometry: any;
      boxGeometry: any;
    }
  }
}

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        ambientLight: any;
        directionalLight: any;
        pointLight: any;
        spotLight: any;
        hemisphereLight: any;
        group: any;
        mesh: any;
        planeGeometry: any;
        meshStandardMaterial: any;
        meshBasicMaterial: any;
        torusGeometry: any;
        cylinderGeometry: any;
        boxGeometry: any;
      }
    }
  }
}
