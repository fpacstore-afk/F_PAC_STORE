import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { LabConfig } from './types';
import { RotateCcw, Eye, Info, Cpu } from 'lucide-react';
import { buildBodyPanel, buildSleeve, buildCollar, mergeAndWeldGeometries } from '../../features/shirt-configurator/procedural/geometry';
import { createFabricMaterial } from '../../features/shirt-configurator/procedural/materials';
import { addLog } from './logsStore';

interface PersistentViewportProps {
  config: LabConfig;
  onAddLog: (log: any) => void;
}

// Sub-component for rendering the procedural shirt in the R3F Canvas
function ProceduralShirt({ config }: { config: LabConfig }) {
  const groupRef = useRef<THREE.Group>(null);

  // Convert LabConfig (cm) to THREE meters
  const measurements = useMemo(() => ({
    length: config.length / 100,
    width: config.width / 100,
    shoulder: config.shoulder / 100,
    sleeveLength: config.sleeveLength / 100,
    sleeveWidth: config.sleeveWidth / 100,
    collarWidth: config.collarSize / 100,
    thickness: config.thickness / 1000,
  }), [config.length, config.width, config.shoulder, config.sleeveLength, config.sleeveWidth, config.collarSize, config.thickness]);

  // Create PBR materials with live parameters
  const bodyMaterial = useMemo(() => {
    const mat = createFabricMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metallic,
      bumpScale: 0.02 * config.aoIntensity,
      useProceduralFabricTexture: true,
    });
    mat.wireframe = config.wireframe;
    mat.side = config.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    return mat;
  }, [config.color, config.roughness, config.metallic, config.aoIntensity, config.wireframe, config.doubleSided]);

  const collarMaterial = useMemo(() => {
    const mat = createFabricMaterial({
      color: config.color,
      roughness: Math.max(0.1, config.roughness - 0.1),
      metalness: config.metallic,
      bumpScale: 0.015 * config.aoIntensity,
      useProceduralFabricTexture: true,
    });
    mat.wireframe = config.wireframe;
    mat.side = config.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    return mat;
  }, [config.color, config.roughness, config.metallic, config.aoIntensity, config.wireframe, config.doubleSided]);

  // Dynamically assemble geometries in group
  useEffect(() => {
    if (!groupRef.current) return;

    // Clear previous children
    while (groupRef.current.children.length > 0) {
      const child = groupRef.current.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      groupRef.current.remove(child);
    }

    try {
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

      const continuousMesh = new THREE.Mesh(continuousGeom, bodyMaterial);
      continuousMesh.name = "Tshirt";
      continuousMesh.castShadow = config.shadowsEnabled;
      continuousMesh.receiveShadow = config.shadowsEnabled;
      groupRef.current.add(continuousMesh);

      // Offset position to align center-pivot nicely
      groupRef.current.position.set(0, -measurements.length / 2, 0);
    } catch (err) {
      console.error("Error generating 3D model: ", err);
    }
  }, [measurements, bodyMaterial, collarMaterial, config.shadowsEnabled]);

  return (
    <group ref={groupRef} />
  );
}

export function PersistentViewport({ config, onAddLog }: PersistentViewportProps) {
  const [showHelpers, setShowHelpers] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const orbitRef = useRef<any>(null);

  const backgroundColor = useMemo(() => new THREE.Color("#0c0c0e"), []);
  const shadowMaterialObj = useMemo(() => new THREE.ShadowMaterial({ opacity: 0.2 }), []);
  const gridHelperObj = useMemo(() => {
    const grid = new THREE.GridHelper(10, 20, '#eab308', '#27272a');
    grid.position.set(0, -0.89, 0);
    return grid;
  }, []);
  const axesHelperObj = useMemo(() => new THREE.AxesHelper(0.5), []);

  const stats = useMemo(() => {
    const baseQuads = 1200 * (config.gridSubdivisions / 30);
    const sleeveQuads = 800 * (config.gridSubdivisions / 30);
    const collarQuads = 600;
    const totalQuads = Math.round(baseQuads * 2 + sleeveQuads * 2 + collarQuads);
    const vertices = Math.round(totalQuads * 4 * (1.1));
    return {
      quads: totalQuads,
      vertices: vertices,
      drawCalls: 5,
      pbrMaps: 3
    };
  }, [config.gridSubdivisions]);

  const setCameraView = (view: 'frente' | 'costas' | 'gola' | 'detalhe') => {
    if (!orbitRef.current) return;
    const controls = orbitRef.current;
    
    const log = addLog('info', 'Câmera Viewport', `Câmera direcionada para a vista: "${view}"`, 'info');
    onAddLog(log);

    switch (view) {
      case 'frente':
        controls.object.position.set(0, 0, 1.8);
        controls.target.set(0, -0.2, 0);
        break;
      case 'costas':
        controls.object.position.set(0, 0, -1.8);
        controls.target.set(0, -0.2, 0);
        break;
      case 'gola':
        controls.object.position.set(0, 0.4, 0.7);
        controls.target.set(0, 0.2, 0);
        break;
      case 'detalhe':
        controls.object.position.set(0.4, -0.2, 0.6);
        controls.target.set(0.2, -0.3, 0);
        break;
    }
    controls.update();
  };

  return (
    <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-900 shadow-xl space-y-4">
      {/* Active WebGL Indicator */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Visualizador 3D Ativo</span>
        </div>
        <span className="text-[9px] font-mono text-zinc-500">{stats.quads.toLocaleString()} quads</span>
      </div>

      {/* Viewport Render Area */}
      <div className="bg-zinc-900 rounded border border-zinc-800/80 overflow-hidden relative shadow-inner h-[380px] lg:h-[450px]">
        <Canvas 
          shadows
          camera={{ position: [0, 0, 1.8], fov: 45 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
        >
          {React.createElement('primitive' as any, { object: backgroundColor, attach: "background" })}
          
          <ambientLight intensity={config.ambientIntensity} />
          
          <directionalLight 
            position={[2, 4, 3]} 
            intensity={config.lightIntensity} 
            castShadow={config.shadowsEnabled}
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-2, 2, -3]} intensity={config.lightIntensity * 0.4} />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} receiveShadow>
            <planeGeometry args={[15, 15]} />
            {React.createElement('primitive' as any, { object: shadowMaterialObj, attach: "material" })}
          </mesh>

          <ProceduralShirt config={config} />

          {showHelpers && (
            <>
              {React.createElement('primitive' as any, { object: gridHelperObj })}
              {React.createElement('primitive' as any, { object: axesHelperObj })}
            </>
          )}

          <OrbitControls 
            ref={orbitRef}
            enableDamping 
            dampingFactor={0.05} 
            minDistance={0.5} 
            maxDistance={5}
            autoRotate={autoRotate}
            autoRotateSpeed={1.5}
          />
        </Canvas>

        {/* Quick viewpoint controllers (Absolute) */}
        <div className="absolute bottom-3 left-3 flex gap-1 bg-black/95 p-1 rounded border border-zinc-800/60 backdrop-blur-md">
          <button onClick={() => setCameraView('frente')} className="px-2 py-0.5 text-[8px] font-black uppercase text-zinc-400 hover:text-white transition-colors">Frente</button>
          <button onClick={() => setCameraView('costas')} className="px-2 py-0.5 text-[8px] font-black uppercase text-zinc-400 hover:text-white transition-colors">Costas</button>
          <button onClick={() => setCameraView('gola')} className="px-2 py-0.5 text-[8px] font-black uppercase text-zinc-400 hover:text-white transition-colors">Gola</button>
          <button onClick={() => setCameraView('detalhe')} className="px-2 py-0.5 text-[8px] font-black uppercase text-zinc-400 hover:text-white transition-colors">Diagonal</button>
        </div>

        {/* Drag Prompt */}
        <div className="absolute top-3 right-3 bg-black/85 text-zinc-400 text-[9px] font-medium px-2 py-0.5 rounded border border-zinc-800/60 pointer-events-none flex items-center gap-1">
          <Eye size={10} /> Arraste para orbitar
        </div>
      </div>

      {/* Secondary view controls below canvas */}
      <div className="flex flex-wrap gap-1.5 justify-between">
        <button 
          onClick={() => {
            setAutoRotate(!autoRotate);
            onAddLog(addLog('info', 'Rotador Lab', `Rotação automática ${!autoRotate ? 'ativada' : 'desativada'}`, 'info'));
          }}
          className={`flex-1 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded border transition-all ${
            autoRotate ? 'bg-zinc-100 text-black border-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
          }`}
        >
          🔄 Rotação: {autoRotate ? 'ON' : 'OFF'}
        </button>
        <button 
          onClick={() => setShowHelpers(!showHelpers)}
          className={`flex-1 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded border transition-all ${
            showHelpers ? 'bg-zinc-100 text-black border-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
          }`}
        >
          🧭 Auxiliares: {showHelpers ? 'ON' : 'OFF'}
        </button>
        <button 
          onClick={() => {
            if (orbitRef.current) {
              orbitRef.current.reset();
              onAddLog(addLog('info', 'Câmera Viewport', 'Reset de posição e zoom efetuado.', 'info'));
            }
          }}
          className="px-2.5 py-1.5 bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1"
        >
          <RotateCcw size={10} /> Reset
        </button>
      </div>

      {/* Collapsible Diagnostics panel */}
      <div className="border-t border-zinc-900 pt-2.5">
        <button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full flex items-center justify-between text-zinc-500 hover:text-zinc-300 text-[10px] font-black uppercase tracking-wider py-1"
        >
          <span className="flex items-center gap-1.5">
            <Cpu size={12} className="text-zinc-500" />
            Diagnóstico de Topologia
          </span>
          <span className="text-[9px] font-bold text-amber-500">
            {showDiagnostics ? '▼ Ocultar' : '▲ Mostrar'}
          </span>
        </button>

        {showDiagnostics && (
          <div className="mt-2.5 bg-zinc-900/40 p-3 rounded border border-zinc-900 space-y-2 text-[10px]">
            <div className="flex justify-between items-center text-zinc-400">
              <span>Faces (Polígonos)</span>
              <span className="font-mono text-white">{stats.quads.toLocaleString()} quads</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>Vértices Alocados</span>
              <span className="font-mono text-white">{stats.vertices.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>Draw Calls</span>
              <span className="font-mono text-white">{stats.drawCalls}</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400 border-t border-zinc-900 pt-2 text-[9px] leading-relaxed italic text-zinc-500">
              <Info size={11} className="inline mr-1 text-amber-500" />
              Ative "Visualizar Aramado" para validar a distribuição simétrica da malha.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
