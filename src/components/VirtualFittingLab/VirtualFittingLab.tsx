import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getLogs, 
  addLog 
} from './logsStore';
import { LabConfig, AuditLog } from './types';
import { OverviewTab } from './tabs/OverviewTab';
import { ConfigTab } from './tabs/ConfigTab';
import { PersistentViewport } from './PersistentViewport';
import { StampsTab } from './tabs/StampsTab';
import { ZonesTab } from './tabs/ZonesTab';
import { RenderTab } from './tabs/RenderTab';
import { PerformanceTab } from './tabs/PerformanceTab';
import { TestsTab } from './tabs/TestsTab';
import { LogsTab } from './tabs/LogsTab';
import { ExportTab } from './tabs/ExportTab';
import { DeployTab } from './tabs/DeployTab';
import { 
  Cpu, 
  Sliders, 
  Layers, 
  Image as ImageIcon, 
  CheckCircle, 
  Sun, 
  TrendingUp, 
  Activity, 
  Terminal, 
  Download, 
  CloudLightning 
} from 'lucide-react';

const DEFAULT_CONFIG: LabConfig = {
  length: 80,
  width: 67,
  shoulder: 30,
  sleeveLength: 26,
  sleeveWidth: 23,
  collarSize: 18,
  thickness: 3,
  color: '#111112',
  roughness: 0.7,
  metallic: 0.1,
  aoIntensity: 1.0,
  wireframe: false,
  doubleSided: true,
  gravity: -9.8,
  windX: 0,
  windZ: 0,
  fabricStiffness: 0.6,
  fabricDamping: 0.5,
  gridSubdivisions: 30,
  lightIntensity: 1.5,
  ambientIntensity: 0.6,
  shadowsEnabled: true,
  selectedZone: 'front'
};

export function VirtualFittingLab() {
  const [activeSubTab, setActiveSubTab] = useState<string>('overview');
  const [config, setConfig] = useState<LabConfig>(DEFAULT_CONFIG);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  // Load audit logs on mount
  useEffect(() => {
    setLogs(getLogs());
  }, []);

  const handleAddLog = (newLog: AuditLog) => {
    setLogs(getLogs());
  };

  const handleConfigChange = (newConfig: LabConfig) => {
    setConfig(newConfig);
  };

  const tabsConfig = [
    { id: 'overview', label: 'Visão Geral', icon: Cpu },
    { id: 'config', label: 'Configurações', icon: Sliders },
    { id: 'stamps', label: 'Upload Estampas', icon: ImageIcon },
    { id: 'zones', label: 'Áreas Úteis', icon: CheckCircle },
    { id: 'render', label: 'Renderização', icon: Sun },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'tests', label: 'Testes (Beta)', icon: Activity },
    { id: 'logs', label: 'Logs Auditoria', icon: Terminal },
    { id: 'export', label: 'Exportar GLB', icon: Download },
    { id: 'deploy', label: 'Deploy sandbox', icon: CloudLightning },
  ];

  return (
    <div className="space-y-6 pt-4 animate-fade-in">
      {/* Tab bar header selection */}
      <div className="flex border-b border-black/10 overflow-x-auto scrollbar-none gap-1 bg-zinc-50 p-1.5 rounded-lg border">
        {tabsConfig.map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                isActive 
                  ? 'bg-black text-white shadow-sm font-bold' 
                  : 'text-zinc-500 hover:text-black hover:bg-zinc-200/50'
              }`}
            >
              <Icon size={12} className={isActive ? 'text-amber-400' : 'text-zinc-400'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Two-Column Responsive Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Sticky 3D Viewport */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-4 z-10 space-y-4">
          <PersistentViewport config={config} onAddLog={handleAddLog} />
        </div>

        {/* Right Side: Scrollable Tab Content Panel */}
        <div className="lg:col-span-7 xl:col-span-8 min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSubTab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
            >
              {activeSubTab === 'overview' && (
                <OverviewTab onAddLog={handleAddLog} />
              )}
              {activeSubTab === 'config' && (
                <ConfigTab config={config} onChange={handleConfigChange} onAddLog={handleAddLog} />
              )}
              {activeSubTab === 'stamps' && (
                <StampsTab onAddLog={handleAddLog} />
              )}
              {activeSubTab === 'zones' && (
                <ZonesTab onAddLog={handleAddLog} />
              )}
              {activeSubTab === 'render' && (
                <RenderTab config={config} onChange={handleConfigChange} onAddLog={handleAddLog} />
              )}
              {activeSubTab === 'performance' && (
                <PerformanceTab config={config} />
              )}
              {activeSubTab === 'tests' && (
                <TestsTab onAddLog={handleAddLog} />
              )}
              {activeSubTab === 'logs' && (
                <LogsTab logs={logs} onLogsChange={setLogs} />
              )}
              {activeSubTab === 'export' && (
                <ExportTab config={config} onAddLog={handleAddLog} />
              )}
              {activeSubTab === 'deploy' && (
                <DeployTab onAddLog={handleAddLog} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
export default VirtualFittingLab;
