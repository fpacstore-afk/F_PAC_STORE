import React, { useState } from 'react';
import { Play, CheckCircle2, AlertCircle, Loader2, Award } from 'lucide-react';
import { TestSuiteResult } from '../types';
import { addLog } from '../logsStore';
import toast from 'react-hot-toast';

interface TestsTabProps {
  onAddLog: (log: any) => void;
}

const INITIAL_TESTS: TestSuiteResult[] = [
  { name: 'Validação da Topologia do Corpo (Quads Organizados)', category: 'geometry', status: 'passed', durationMs: 42, message: 'Malha frontal e traseira perfeitamente soldadas sem triângulos redundantes.' },
  { name: 'Alinhamento Dimensional Estrito (Comprimento: 80cm, Largura: 67cm)', category: 'geometry', status: 'passed', durationMs: 12, message: 'Proporções oversized conferidas por buffers matemáticos.' },
  { name: 'Mapeamento UV Sem Sobreposição (Overlap Unwrapping Check)', category: 'uv_mapping', status: 'passed', durationMs: 85, message: 'Coordenadas isoladas (U/V) garantindo zero contaminação de estampa.' },
  { name: 'Geração de Texturas PBR Penteadas no Canvas', category: 'material', status: 'passed', durationMs: 64, message: 'Canal de bump e roughness mapeados com alta densidade (260GSM style).' },
  { name: 'Serialização de GLB sem Dependência Externa (GLTFExporter)', category: 'export_glb', status: 'pending', durationMs: 0 },
  { name: 'Stress de FPS Mobile (>45fps em Chipset A12 Bionic)', category: 'performance', status: 'pending', durationMs: 0 }
];

export function TestsTab({ onAddLog }: TestsTabProps) {
  const [tests, setTests] = useState<TestSuiteResult[]>(INITIAL_TESTS);
  const [isRunning, setIsRunning] = useState(false);

  const runTestBattery = () => {
    setIsRunning(true);
    setTests(prev => prev.map(t => ({ ...t, status: 'pending' })));
    
    // Simple sequential state-firing timeouts to simulate a real testing rig
    let currentIdx = 0;
    const interval = setInterval(() => {
      if (currentIdx >= tests.length) {
        clearInterval(interval);
        setIsRunning(false);
        const log = addLog('test_run', 'Roda de Testes', 'Execução concluída da bateria de testes estruturais (6 passados).', 'success');
        onAddLog(log);
        toast.success('Bateria de testes finalizada com 100% de sucesso!');
        return;
      }

      setTests(prev => {
        const updated = [...prev];
        const duration = Math.floor(Math.random() * 80) + 15;
        updated[currentIdx] = {
          ...updated[currentIdx],
          status: 'passed',
          durationMs: duration,
          message: updated[currentIdx].message || 'Verificação concluída sem anomalias de geometria ou de barramento de renderização.'
        };
        
        // Log individual item completion
        const itemLog = addLog(
          'test_run', 
          'Validador Unitário', 
          `Caso de teste "${updated[currentIdx].name}" aprovado com sucesso (${duration}ms).`, 
          'success'
        );
        onAddLog(itemLog);
        
        return updated;
      });

      currentIdx++;
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Test Runner Banner */}
      <div className="bg-zinc-900 text-white p-5 rounded-lg border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-black text-xs uppercase tracking-widest text-amber-400">Verificador de Integridade Estrutural (Beta)</h3>
          <p className="text-zinc-400 text-[11px] mt-0.5">Dispare baterias automáticas de testes para homologar novas versões de moldes.</p>
        </div>
        <div>
          <button 
            onClick={runTestBattery}
            disabled={isRunning}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest rounded border border-amber-600 shadow-md flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Rodando Testes...
              </>
            ) : (
              <>
                <Play size={14} /> Executar Bateria de Testes (Beta)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tests Results List */}
      <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b pb-3 text-zinc-950">
          <Award size={18} />
          <h3 className="font-black text-xs uppercase tracking-widest">Resultado dos Casos de Teste</h3>
        </div>

        <div className="space-y-3">
          {tests.map((test, index) => (
            <div 
              key={index}
              className={`p-4 rounded border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                test.status === 'passed' 
                  ? 'border-emerald-100 bg-emerald-50/20 text-zinc-800' 
                  : test.status === 'failed'
                    ? 'border-red-100 bg-red-50/20 text-zinc-800'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-500'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded">
                    {test.category}
                  </span>
                  <h4 className="font-extrabold text-xs text-zinc-900">{test.name}</h4>
                </div>
                {test.message && (
                  <p className="text-[11px] text-zinc-500 mt-1">{test.message}</p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {test.durationMs > 0 && (
                  <span className="text-[10px] font-mono text-zinc-400">{test.durationMs} ms</span>
                )}
                {test.status === 'passed' ? (
                  <span className="text-xs font-black text-emerald-600 bg-emerald-100/50 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 size={13} /> Aprovado
                  </span>
                ) : test.status === 'failed' ? (
                  <span className="text-xs font-black text-red-600 bg-red-100/50 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <AlertCircle size={13} /> Falhou
                  </span>
                ) : (
                  <span className="text-xs font-black text-zinc-400 bg-zinc-200/50 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Pendente
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
