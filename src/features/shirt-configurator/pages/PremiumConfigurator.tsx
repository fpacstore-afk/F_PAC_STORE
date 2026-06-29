import React, { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { 
  Sparkles, Layers, Sliders, Info, Download, 
  Upload, Move, RotateCw, ZoomIn, Check, Trash2, HelpCircle
} from "lucide-react";
import toast from "react-hot-toast";

import { ShirtMeasurements, ShirtZone, StampTransform } from "../procedural/types";
import { DEFAULT_MEASUREMENTS, buildOversizedShirtGroup } from "../procedural/shirt";
import { exportShirtToGLB } from "../procedural/export";

// Premium color presets for the fabric
const PREMIUM_COLORS = [
  { name: "Preto Carbono", hex: "#111112" },
  { name: "Branco Off-White", hex: "#f4f4f0" },
  { name: "Azul Deep Sea", hex: "#1d2a44" },
  { name: "Verde Militar", hex: "#2b3d2f" },
  { name: "Areia Deserto", hex: "#d2b48c" },
  { name: "Vinho Carmim", hex: "#4a121a" },
];

interface PremiumConfiguratorProps {
  initialColorHex: string;
  initialSize: string;
  catalogStamps: any[];
  parentPrintConfigs: any[];
  onUpdateCartConfigs: (configs: any[]) => void;
  onColorChange: (colorHex: string) => void;
  onSizeChange: (size: string) => void;
}

// Inner 3D scene component for React Three Fiber Canvas
function ShirtScene({
  measurements,
  baseColor,
  printConfigs,
  selectedZone,
  stampTransforms,
}: {
  measurements: ShirtMeasurements;
  baseColor: string;
  printConfigs: any[];
  selectedZone: ShirtZone;
  stampTransforms: Record<ShirtZone, StampTransform>;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Re-build procedural shirt mesh whenever measurements or color changes
  useEffect(() => {
    if (!groupRef.current) return;
    
    // Clear previous mesh children
    while (groupRef.current.children.length > 0) {
      const child = groupRef.current.children[0];
      groupRef.current.remove(child);
    }

    // Build fresh procedural oversized shirt
    const freshShirt = buildOversizedShirtGroup(measurements, baseColor);
    groupRef.current.add(freshShirt);
  }, [measurements, baseColor]);

  // Load stamp textures for rendering coplanar overlays
  const [textures, setTextures] = useState<Record<string, THREE.Texture>>({});

  useEffect(() => {
    printConfigs.forEach((conf) => {
      if (conf?.image && !textures[conf.image]) {
        new THREE.TextureLoader().load(conf.image, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          setTextures((prev) => ({ ...prev, [conf.image!]: tex }));
        });
      }
    });
  }, [printConfigs]);

  // Translate e-commerce locations to procedural zones
  const getZoneForLocation = (loc: string): ShirtZone => {
    if (loc.includes("Frente") || loc.includes("Peito")) return "front";
    if (loc.includes("Costas")) return "back";
    if (loc.includes("Manga Esquerda")) return "leftSleeve";
    if (loc.includes("Manga Direita")) return "rightSleeve";
    return "collar";
  };

  return (
    <group>
      {/* Container for the procedurally generated shirt */}
      <group ref={groupRef} />

      {/* Render custom stamps / print decals as high-contrast coplanar quad overlays */}
      {printConfigs.map((conf, index) => {
        if (!conf?.image || !textures[conf.image]) return null;

        const zone = getZoneForLocation(conf.location);
        const transform = stampTransforms[zone];
        const sizeScale = transform.scale;
        const widthVal = 0.16 * sizeScale;
        const heightVal = 0.16 * sizeScale;

        // Position and orient the stamp based on the zone
        let pX = transform.offsetX;
        let pY = 0.14 + transform.offsetY; // offset to chest area
        let pZ = 0.08 + measurements.thickness + 0.003; // slightly offset from body front
        let rotX = 0;
        let rotY = 0;
        let rotZ = (transform.rotation * Math.PI) / 180;

        if (zone === "back") {
          pX = -transform.offsetX; // Mirrored for back orientation
          pZ = -(0.06 + measurements.thickness + 0.003);
          rotY = Math.PI; // Face backwards
        } else if (zone === "leftSleeve") {
          const sLength = measurements.sleeveLength;
          pX = -(measurements.width / 2 + sLength * 0.4) + transform.offsetX;
          pY = 0.28 + transform.offsetY;
          pZ = transform.offsetY;
          rotY = -Math.PI / 2;
          rotX = -Math.PI / 6; // Angled sleeve drape
        } else if (zone === "rightSleeve") {
          const sLength = measurements.sleeveLength;
          pX = (measurements.width / 2 + sLength * 0.4) + transform.offsetX;
          pY = 0.28 + transform.offsetY;
          pZ = transform.offsetY;
          rotY = Math.PI / 2;
          rotX = Math.PI / 6;
        }

        // Apply a distinct scale if selected zone is active for visual feedback
        const isActive = selectedZone === zone;
        const borderGlow = isActive ? 0.003 : 0;

        return (
          <group key={conf.id || index} position={[pX, pY, pZ]} rotation={[rotX, rotY, rotZ]}>
            {/* Visual target border if active */}
            {isActive && (
              <mesh position={[0, 0, -0.0005]}>
                <planeGeometry args={[widthVal + 0.01, heightVal + 0.01]} />
                <meshBasicMaterial color="#eab308" transparent opacity={0.4} side={THREE.DoubleSide} />
              </mesh>
            )}
            {/* The stamp itself */}
            <mesh castShadow receiveShadow>
              <planeGeometry args={[widthVal, heightVal]} />
              <meshBasicMaterial
                map={textures[conf.image]}
                transparent
                depthWrite={true}
                polygonOffset={true}
                polygonOffsetFactor={-4} // Prevent z-fighting
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function PremiumConfigurator({
  initialColorHex,
  initialSize,
  catalogStamps,
  parentPrintConfigs,
  onUpdateCartConfigs,
  onColorChange,
  onSizeChange,
}: PremiumConfiguratorProps) {
  // Configurator UI States
  const [activeZone, setActiveZone] = useState<ShirtZone>("front");
  const [selectedColor, setSelectedColor] = useState(initialColorHex);
  const [selectedSize, setSelectedSize] = useState(initialSize);
  const [isExporting, setIsExporting] = useState(false);

  // Shirt dimensions sliders (measurements in meters)
  const [measurements, setMeasurements] = useState<ShirtMeasurements>({
    ...DEFAULT_MEASUREMENTS,
  });

  // Stamp transformations state for each zone
  const [stampTransforms, setStampTransforms] = useState<Record<ShirtZone, StampTransform>>({
    front: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0 },
    back: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0 },
    leftSleeve: { scale: 0.8, rotation: 0, offsetX: 0, offsetY: 0 },
    rightSleeve: { scale: 0.8, rotation: 0, offsetX: 0, offsetY: 0 },
    collar: { scale: 0.6, rotation: 0, offsetX: 0, offsetY: 0 },
  });

  // Reference for file input uploads
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize color from props
  useEffect(() => {
    if (initialColorHex) {
      setSelectedColor(initialColorHex);
    }
  }, [initialColorHex]);

  // Translate zone keys to localized labels
  const getZoneLabel = (zone: ShirtZone): string => {
    switch (zone) {
      case "front": return "Frente / Peito";
      case "back": return "Costas";
      case "leftSleeve": return "Manga Esquerda";
      case "rightSleeve": return "Manga Direita";
      case "collar": return "Gola";
    }
  };

  const getEcomLocationName = (zone: ShirtZone): string => {
    switch (zone) {
      case "front": return "Frente";
      case "back": return "Costas";
      case "leftSleeve": return "Manga Esquerda";
      case "rightSleeve": return "Manga Direita";
      default: return "Gola";
    }
  };

  // Check if a stamp is applied in the current zone
  const getActiveStampInZone = () => {
    const loc = getEcomLocationName(activeZone);
    return parentPrintConfigs.find(c => c && c.location === loc);
  };

  // Apply a stamp to the active zone
  const handleApplyStamp = (stampName: string, imageUrl: string) => {
    const loc = getEcomLocationName(activeZone);
    const existingIdx = parentPrintConfigs.findIndex(c => c && c.location === loc);

    const newConfig = {
      id: existingIdx !== -1 ? parentPrintConfigs[existingIdx].id : Math.random().toString(),
      stamp: stampName,
      location: loc,
      printSize: selectedSize || "M",
      image: imageUrl,
      background: "Sem Fundo" as const,
      scale: stampTransforms[activeZone].scale,
      rotation: stampTransforms[activeZone].rotation,
      offsetX: stampTransforms[activeZone].offsetX,
      offsetY: stampTransforms[activeZone].offsetY,
    };

    let updated = [...parentPrintConfigs];
    if (existingIdx !== -1) {
      updated[existingIdx] = newConfig;
    } else {
      // Maximum 3 stamps
      if (updated.filter(Boolean).length >= 3) {
        toast.error("Limite máximo de 3 estampas atingido!");
        return;
      }
      updated.push(newConfig);
    }

    onUpdateCartConfigs(updated);
    toast.success(`Estampa aplicada na ${getZoneLabel(activeZone)}!`);
  };

  // Remove stamp from the active zone
  const handleRemoveStamp = () => {
    const loc = getEcomLocationName(activeZone);
    const updated = parentPrintConfigs.filter(c => c && c.location !== loc);
    onUpdateCartConfigs(updated);
    toast.success(`Estampa removida da ${getZoneLabel(activeZone)}.`);
  };

  // Handle uploaded images (Drag and Drop / File Picker)
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem válido.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      handleApplyStamp("Custom Uploaded Logo", dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Handle slider changes for stamp transforms
  const updateTransform = (field: keyof StampTransform, val: number) => {
    setStampTransforms((prev) => {
      const updated = {
        ...prev,
        [activeZone]: {
          ...prev[activeZone],
          [field]: val,
        },
      };

      // Notify parent if active config has this transform
      const loc = getEcomLocationName(activeZone);
      const existingIdx = parentPrintConfigs.findIndex(c => c && c.location === loc);
      if (existingIdx !== -1) {
        const updatedConfigs = [...parentPrintConfigs];
        updatedConfigs[existingIdx] = {
          ...updatedConfigs[existingIdx],
          scale: updated[activeZone].scale,
          rotation: updated[activeZone].rotation,
          offsetX: updated[activeZone].offsetX,
          offsetY: updated[activeZone].offsetY,
        };
        onUpdateCartConfigs(updatedConfigs);
      }

      return updated;
    });
  };

  // Trigger client-side binary .glb model download
  const handleExportGLB = async () => {
    setIsExporting(true);
    const id = toast.loading("Gerando arquivo de malha 3D...");
    try {
      // 1. Build the specific shirt group in memory with current customized adjustments
      const shirtGroup = buildOversizedShirtGroup(measurements, selectedColor);

      // 2. Parse the group into a binary GLB buffer
      const arrayBuffer = await exportShirtToGLB(shirtGroup);

      // 3. Initiate browser file download
      const blob = new Blob([arrayBuffer], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `oversized-shirt-customized.glb`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Modelo 3D model.glb exportado com sucesso!", { id });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar o arquivo de exportação 3D.", { id });
    } finally {
      setIsExporting(false);
    }
  };

  const activeStamp = getActiveStampInZone();

  return (
    <div 
      className="w-full bg-neutral-950 border border-neutral-900 rounded-[2.5rem] overflow-hidden flex flex-col lg:grid lg:grid-cols-12 text-white relative shadow-2xl"
      id="premium-configurator-container"
    >
      {/* 1. LEFT SIDEBAR: Tools, Uploads & Stamps Library */}
      <div 
        className="col-span-12 lg:col-span-3 border-b lg:border-b-0 lg:border-r border-neutral-900 p-6 flex flex-col bg-neutral-950/90 backdrop-blur-md"
        id="configurator-stamps-sidebar"
      >
        <div className="flex items-center gap-2 mb-5">
          <Layers className="w-5 h-5 text-[#eab308]" />
          <h3 className="font-sans font-black text-xs uppercase tracking-widest text-neutral-100">
            Estampas & Uploads
          </h3>
        </div>

        {/* Customizer zone navigation */}
        <div className="mb-6">
          <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-2">
            Selecione a Área de Ajuste
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(["front", "back", "leftSleeve", "rightSleeve"] as ShirtZone[]).map((zone) => {
              const hasStamp = parentPrintConfigs.some(c => c && c.location === getEcomLocationName(zone));
              return (
                <button
                  key={zone}
                  onClick={() => setActiveZone(zone)}
                  className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border ${
                    activeZone === zone
                      ? "bg-[#eab308] text-black border-[#eab308]"
                      : "bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700"
                  } flex items-center justify-between`}
                >
                  <span>{getZoneLabel(zone).split(" ")[0]}</span>
                  {hasStamp && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Drag & Drop File Upload Area */}
        <div 
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className="group cursor-pointer mb-6 border border-dashed border-neutral-800 hover:border-[#eab308]/60 p-5 rounded-2xl bg-neutral-900/30 text-center transition-all flex flex-col items-center justify-center gap-2"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            className="hidden" 
            accept="image/*"
          />
          <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 group-hover:border-[#eab308]/30 transition-all">
            <Upload className="w-4 h-4 text-neutral-400 group-hover:text-[#eab308] transition-all" />
          </div>
          <div>
            <p className="font-sans font-bold text-[11px] text-neutral-200">
              Faça Upload da sua Arte
            </p>
            <p className="font-sans text-[9px] text-neutral-500 mt-0.5 leading-relaxed">
              Arraste sua imagem PNG aqui ou clique para buscar no computador
            </p>
          </div>
        </div>

        {/* Library Stamps Area */}
        <div className="flex-1 overflow-y-auto max-h-[180px] lg:max-h-none pr-1">
          <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-2.5">
            Artes Prontas da Galeria
          </label>
          {catalogStamps.length === 0 ? (
            <p className="text-[10px] text-neutral-500 italic">Carregando galeria...</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {catalogStamps.map((stamp) => (
                <button
                  key={stamp.id}
                  onClick={() => handleApplyStamp(stamp.name, stamp.image)}
                  className="group relative aspect-square rounded-xl bg-neutral-900 border border-neutral-800 hover:border-[#eab308]/60 p-1.5 flex items-center justify-center transition-all overflow-hidden"
                >
                  <img
                    src={stamp.image}
                    alt={stamp.name}
                    className="w-full h-full object-contain filter brightness-95 group-hover:scale-105 transition-transform"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-[8px] font-mono font-bold tracking-wider text-white">APLICAR</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-neutral-900 flex items-center gap-2 text-[10px] text-neutral-500">
          <Info className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
          <span>Fundo automático removido para estampas PNG</span>
        </div>
      </div>

      {/* 2. CENTRAL VIEWPORT: 3D Canvas Space */}
      <div 
        className="col-span-12 lg:col-span-6 h-[460px] lg:h-[620px] flex flex-col relative bg-[#09090b] overflow-hidden"
        id="configurator-3d-canvas"
      >
        {/* Subtle crosshair drafting grid overlay */}
        <div className="absolute inset-x-12 top-1/2 -translate-y-1/2 border-t border-neutral-900/30 pointer-events-none" />
        <div className="absolute inset-y-12 left-1/2 -translate-x-1/2 border-l border-neutral-900/30 pointer-events-none" />

        {/* 3D Render Canvas */}
        <Canvas
          shadows
          camera={{ position: [0, 0, 1.4], fov: 45 }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          {/* Lighting Rig for Fabric PBR highlights */}
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[3, 5, 4]}
            intensity={1.2}
            castShadow
            shadow-mapSize={1024}
            shadow-bias={-0.0001}
          />
          <pointLight position={[-4, 2, -3]} intensity={0.5} />
          <spotLight position={[0, -2, 2]} intensity={0.4} angle={0.6} penumbra={1} />

          <ShirtScene
            measurements={measurements}
            baseColor={selectedColor}
            printConfigs={parentPrintConfigs}
            selectedZone={activeZone}
            stampTransforms={stampTransforms}
          />

          <OrbitControls
            enableZoom={true}
            minDistance={0.6}
            maxDistance={2.0}
            maxPolarAngle={Math.PI / 2 + 0.1}
            minPolarAngle={Math.PI / 4}
            enablePan={false}
          />
        </Canvas>

        {/* Export / Download button at bottom-right corner */}
        <div className="absolute bottom-6 right-6 z-10">
          <button
            onClick={handleExportGLB}
            disabled={isExporting}
            className="flex items-center gap-2 bg-[#eab308] text-black hover:bg-yellow-400 disabled:bg-neutral-800 disabled:text-neutral-500 font-sans font-black text-xs uppercase tracking-widest px-5 py-3 rounded-2xl shadow-xl transition-all border border-yellow-300/30 hover:scale-[1.02] cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{isExporting ? "Gerando..." : "Exportar model.glb"}</span>
          </button>
        </div>

        {/* Floating status banner */}
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-neutral-900/80 border border-neutral-800 px-3 py-1.5 rounded-xl backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-[9px] font-mono tracking-widest text-neutral-300 uppercase">
            Estúdio 3D Ativo • {getZoneLabel(activeZone)}
          </span>
        </div>
      </div>

      {/* 3. RIGHT SIDEBAR: Sizing, Colors & Customization Controls */}
      <div 
        className="col-span-12 lg:col-span-3 border-t lg:border-t-0 lg:border-l border-neutral-900 p-6 flex flex-col bg-neutral-950/90 backdrop-blur-md"
        id="configurator-controls-sidebar"
      >
        <div className="flex items-center gap-2 mb-5">
          <Sliders className="w-5 h-5 text-[#eab308]" />
          <h3 className="font-sans font-black text-xs uppercase tracking-widest text-neutral-100">
            Configurações do Modelo
          </h3>
        </div>

        {/* Custom Fabric Color Picker */}
        <div className="mb-6">
          <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-2.5">
            Cor da Malha Premium
          </label>
          <div className="flex flex-wrap gap-2.5">
            {PREMIUM_COLORS.map((col) => (
              <button
                key={col.hex}
                onClick={() => {
                  setSelectedColor(col.hex);
                  onColorChange(col.hex);
                }}
                className={`group relative w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${
                  selectedColor.toLowerCase() === col.hex.toLowerCase()
                    ? "border-[#eab308] scale-110"
                    : "border-neutral-800 hover:border-neutral-600 hover:scale-105"
                }`}
                style={{ backgroundColor: col.hex }}
                title={col.name}
              >
                {selectedColor.toLowerCase() === col.hex.toLowerCase() && (
                  <Check className="w-4 h-4 text-white absolute inset-0 m-auto filter drop-shadow-md" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Print controls (shows sliders only if a stamp is active in the zone) */}
        {activeStamp ? (
          <div className="mb-6 border-b border-neutral-900 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                Ajuste da Estampa ({getZoneLabel(activeZone).split(" ")[0]})
              </span>
              <button
                onClick={handleRemoveStamp}
                className="text-[9px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 uppercase transition-colors"
                title="Deletar estampa desta área"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remover</span>
              </button>
            </div>

            {/* Slider 1: Stamp Scale */}
            <div className="space-y-1.5 mb-3.5">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span className="flex items-center gap-1">
                  <ZoomIn className="w-3.5 h-3.5" /> Tamanho
                </span>
                <span className="font-mono text-[9px] bg-neutral-900 px-1.5 py-0.5 rounded-md text-[#eab308] font-bold">
                  {Math.round(stampTransforms[activeZone].scale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.3"
                max="1.6"
                step="0.05"
                value={stampTransforms[activeZone].scale}
                onChange={(e) => updateTransform("scale", parseFloat(e.target.value))}
                className="w-full accent-[#eab308] bg-neutral-900 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Slider 2: Stamp Rotation */}
            <div className="space-y-1.5 mb-3.5">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span className="flex items-center gap-1">
                  <RotateCw className="w-3.5 h-3.5" /> Rotação
                </span>
                <span className="font-mono text-[9px] bg-neutral-900 px-1.5 py-0.5 rounded-md text-[#eab308] font-bold">
                  {stampTransforms[activeZone].rotation}°
                </span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={stampTransforms[activeZone].rotation}
                onChange={(e) => updateTransform("rotation", parseInt(e.target.value))}
                className="w-full accent-[#eab308] bg-neutral-900 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Slider 3: Vertical Offset */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span className="flex items-center gap-1">
                  <Move className="w-3.5 h-3.5" /> Posição Altura
                </span>
                <span className="font-mono text-[9px] bg-neutral-900 px-1.5 py-0.5 rounded-md text-[#eab308] font-bold">
                  {Math.round(stampTransforms[activeZone].offsetY * 100)} cm
                </span>
              </div>
              <input
                type="range"
                min="-0.25"
                max="0.2"
                step="0.01"
                value={stampTransforms[activeZone].offsetY}
                onChange={(e) => updateTransform("offsetY", parseFloat(e.target.value))}
                className="w-full accent-[#eab308] bg-neutral-900 h-1.5 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-2xl bg-neutral-900/40 border border-neutral-900 text-center text-xs text-neutral-400">
            Nenhuma estampa ativa na {getZoneLabel(activeZone)}. Escolha uma arte ao lado ou faça upload.
          </div>
        )}

        {/* Real-time shirt measurements customization sliders */}
        <div className="mt-auto border-t border-neutral-900 pt-5">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block mb-4">
            Ajustes de Modelagem Procedural
          </span>

          {/* Model Width (Largura) Slider */}
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>Largura do Torso (Largura)</span>
              <span className="font-mono text-[9px] bg-neutral-900 px-1.5 py-0.5 rounded-md text-white font-bold">
                {Math.round(measurements.width * 100)} cm
              </span>
            </div>
            <input
              type="range"
              min="0.55"
              max="0.75"
              step="0.01"
              value={measurements.width}
              onChange={(e) => setMeasurements(prev => ({ ...prev, width: parseFloat(e.target.value) }))}
              className="w-full accent-white bg-neutral-900 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          {/* Model Length (Comprimento) Slider */}
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>Altura do Corpo (Comprimento)</span>
              <span className="font-mono text-[9px] bg-neutral-900 px-1.5 py-0.5 rounded-md text-white font-bold">
                {Math.round(measurements.length * 100)} cm
              </span>
            </div>
            <input
              type="range"
              min="0.70"
              max="0.90"
              step="0.01"
              value={measurements.length}
              onChange={(e) => setMeasurements(prev => ({ ...prev, length: parseFloat(e.target.value) }))}
              className="w-full accent-white bg-neutral-900 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          {/* Fabric Thickness Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>Espessura do Tecido (Fidelity)</span>
              <span className="font-mono text-[9px] bg-neutral-900 px-1.5 py-0.5 rounded-md text-white font-bold">
                {(measurements.thickness * 1000).toFixed(1)} mm
              </span>
            </div>
            <input
              type="range"
              min="0.001"
              max="0.006"
              step="0.0005"
              value={measurements.thickness}
              onChange={(e) => setMeasurements(prev => ({ ...prev, thickness: parseFloat(e.target.value) }))}
              className="w-full accent-white bg-neutral-900 h-1.5 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
