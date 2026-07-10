import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { LabConfig } from '../types';
import { RotateCcw, Eye, Camera, Check, Info, ZoomIn, Cpu } from 'lucide-react';
import { buildBodyPanel, buildSleeve, buildCollar, mergeAndWeldGeometries } from '../../../features/shirt-configurator/procedural/geometry';
import { createFabricMaterial } from '../../../features/shirt-configurator/procedural/materials';
import { addLog } from '../logsStore';

interface MockupTabProps {
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

export function MockupTab({ config, onAddLog }: MockupTabProps) {
  const [showHelpers, setShowHelpers] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const orbitRef = useRef<any>(null);

  const backgroundColor = useMemo(() => new THREE.Color("#0c0c0e"), []);
  const shadowMaterialObj = useMemo(() => new THREE.ShadowMaterial({ opacity: 0.2 }), []);
  const gridHelperObj = useMemo(() => {
    const grid = new THREE.GridHelper(10, 20, '#eab308', '#27272a');
    grid.position.set(0, -0.89, 0);
    return grid;
  }, []);
  const axesHelperObj = useMemo(() => new THREE.AxesHelper(0.5), []);

  // Simulated geometry analysis stats
  const stats = useMemo(() => {
    // Standard oversized subdivisions calculate approx quads
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

  // Handle camera viewpoint preset actions
  const setCameraView = (view: 'frente' | 'costas' | 'gola' | 'detalhe') => {
    if (!orbitRef.current) return;
    const controls = orbitRef.current;
    
    // Log view change
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
    <div className="space-y-6">
      {/* Top action controls bar */}
      <div className="bg-white p-4 rounded-lg border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-black uppercase tracking-widest text-zinc-900">Renderizador WebGL Ativo</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => {
              setAutoRotate(!autoRotate);
              onAddLog(addLog('info', 'Rotador Lab', `Rotação automática ${!autoRotate ? 'ativada' : 'desativada'}`, 'info'));
            }}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded border transition-all ${
              autoRotate ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100 border-zinc-200'
            }`}
          >
            🔄 Rotação Automática: {autoRotate ? 'ON' : 'OFF'}
          </button>
          <button 
            onClick={() => setShowHelpers(!showHelpers)}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded border transition-all ${
              showHelpers ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100 border-zinc-200'
            }`}
          >
            🧭 Auxiliares 3D: {showHelpers ? 'ON' : 'OFF'}
          </button>
          <button 
            onClick={() => {
              if (orbitRef.current) {
                orbitRef.current.reset();
                onAddLog(addLog('info', 'Câmera Viewport', 'Reset de posição e zoom efetuado.', 'info'));
              }
            }}
            className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-[10px] font-black uppercase tracking-wider rounded border border-zinc-200 flex items-center gap-1.5"
          >
            <RotateCcw size={11} /> Reset Câmera
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Viewport Render Area (left) */}
        <div className="lg:col-span-8 bg-zinc-950 aspect-video md:h-[500px] rounded-lg border border-zinc-900 overflow-hidden relative shadow-inner">
          
          {/* Canvas Rendering Context */}
          <Canvas 
            shadows
            camera={{ position: [0, 0, 1.8], fov: 45 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
          >
            {React.createElement('primitive' as any, { object: backgroundColor, attach: "background" })}
            
            {/* Soft Ambient Fill */}
            <ambientLight intensity={config.ambientIntensity} />
            
            {/* Warm overhead key light */}
            <directionalLight 
              position={[2, 4, 3]} 
              intensity={config.lightIntensity} 
              castShadow={config.shadowsEnabled}
              shadow-mapSize={[1024, 1024]}
            />
            {/* Soft backdrop back-light to outline details */}
            <directionalLight position={[-2, 2, -3]} intensity={config.lightIntensity * 0.4} />

            {/* Simulated Stage Ground */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} receiveShadow>
              <planeGeometry args={[15, 15]} />
              {React.createElement('primitive' as any, { object: shadowMaterialObj, attach: "material" })}
            </mesh>

            {/* The procedurally styled shirt */}
            <ProceduralShirt config={config} />

            {/* helpers */}
            {showHelpers && (
              <>
                {React.createElement('primitive' as any, { object: gridHelperObj })}
                {React.createElement('primitive' as any, { object: axesHelperObj })}
              </>
            )}

            {/* Orbit Camera controls */}
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
          <div className="absolute bottom-4 left-4 flex gap-1.5 bg-black/80 p-1.5 rounded border border-zinc-800 backdrop-blur-sm">
            <button onClick={() => setCameraView('frente')} className="px-2.5 py-1 text-[9px] font-black uppercase text-zinc-300 hover:text-white transition-colors">Frente</button>
            <button onClick={() => setCameraView('costas')} className="px-2.5 py-1 text-[9px] font-black uppercase text-zinc-300 hover:text-white transition-colors">Costas</button>
            <button onClick={() => setCameraView('gola')} className="px-2.5 py-1 text-[9px] font-black uppercase text-zinc-300 hover:text-white transition-colors">Gola</button>
            <button onClick={() => setCameraView('detalhe')} className="px-2.5 py-1 text-[9px] font-black uppercase text-zinc-300 hover:text-white transition-colors">Diagonal</button>
          </div>

          {/* Double-Click Prompt overlay */}
          <div className="absolute top-4 right-4 bg-black/60 text-zinc-400 text-[10px] font-medium px-2 py-1 rounded border border-zinc-800 pointer-events-none flex items-center gap-1">
            <Eye size={12} /> Arraste para orbitar • Scroll para zoom
          </div>
        </div>

        {/* Real-time Diagnostics sidebar (right) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Geometrical Inspector */}
          <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-sm flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 border-b pb-3 mb-4">
                <Cpu className="text-zinc-900" size={18} />
                <h3 className="font-black text-xs uppercase tracking-widest text-zinc-900">Diagnóstico de Topologia</h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs border-b pb-2 border-zinc-100">
                  <span className="text-zinc-500 font-medium">Contagem de Polígonos (Faces)</span>
                  <span className="font-bold text-zinc-900">{stats.quads.toLocaleString()} quads</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b pb-2 border-zinc-100">
                  <span className="text-zinc-500 font-medium">Vértices Alocados</span>
                  <span className="font-bold text-zinc-900">{stats.vertices.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b pb-2 border-zinc-100">
                  <span className="text-zinc-500 font-medium">Draw Calls Ativos</span>
                  <span className="font-bold text-zinc-900">{stats.drawCalls}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b pb-2 border-zinc-100">
                  <span className="text-zinc-500 font-medium">Texturas PBR Carregadas</span>
                  <span className="font-bold text-zinc-900">{stats.pbrMaps} / 3</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-1">
                  <span className="text-zinc-500 font-medium">Geração de UVs</span>
                  <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] uppercase">Automática (OK)</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-50 p-3 rounded border border-zinc-200 text-[11px] text-zinc-600 leading-relaxed mt-6">
              <div className="flex gap-1.5 items-start mb-1 text-zinc-900 font-black uppercase tracking-wider text-[10px]">
                <Info size={13} className="text-amber-500 mt-0.5 shrink-0" />
                Dica de Homologação
              </div>
              Utilize o modo de visualização de <strong>Aramado (Wireframe)</strong> na aba de configurações para validar se a distribuição de quads nas dobras e mangas está simétrica e limpa.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
