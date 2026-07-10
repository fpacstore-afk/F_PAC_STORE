export interface LabConfig {
  length: number; // in cm
  width: number;  // in cm
  shoulder: number; // in cm
  sleeveLength: number; // in cm
  sleeveWidth: number;  // in cm
  collarSize: number;   // in cm
  thickness: number;    // in mm
  color: string;
  roughness: number;
  metallic: number;
  aoIntensity: number;
  wireframe: boolean;
  doubleSided: boolean;
  gravity: number;
  windX: number;
  windZ: number;
  fabricStiffness: number;
  fabricDamping: number;
  gridSubdivisions: number;
  lightIntensity: number;
  ambientIntensity: number;
  shadowsEnabled: boolean;
  selectedZone: 'front' | 'back' | 'leftSleeve' | 'rightSleeve' | 'collar';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  type: 'creation' | 'modification' | 'error' | 'performance_test' | 'export' | 'deploy' | 'test_run' | 'info';
  component: string;
  description: string;
  status: 'success' | 'warning' | 'error' | 'info';
  user: string;
}

export interface LabStamp {
  id: string;
  name: string;
  url: string;
  scaleX: number;
  scaleY: number;
  posX: number;
  posY: number;
  rotation: number; // in degrees
}

export interface TestSuiteResult {
  name: string;
  category: 'geometry' | 'uv_mapping' | 'material' | 'export_glb' | 'performance';
  status: 'passed' | 'failed' | 'pending';
  durationMs: number;
  message?: string;
}
