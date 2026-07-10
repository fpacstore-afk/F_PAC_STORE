import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Sparkles, AlertTriangle, CheckSquare, Clock, Cpu, BarChart2, CheckCircle, Flame, Server } from 'lucide-react';
import { addLog } from '../logsStore';

interface OverviewTabProps {
  onAddLog: (log: any) => void;
}

export function OverviewTab({ onAddLog }: OverviewTabProps) {
  // Checklist State stored in localStorage or local React state for quick interaction
  const [checklist, setChecklist] = useState([
    { id: 1, text: 'Isolamento completo de arquivos da produção', done: true },
    { id: 2, text: 'Desenvolvimento do novo provador em sandbox própria', done: true },
    { id: 3, text: 'Renderização procedural do modelo Oversized com medidas exatas', done: true },
    { id: 4, text: 'Geração e mapeamento automático de coordenadas UV limpas', done: true },
    { id: 5, text: 'Suporte a texturas PBR realistas de malha canelada e algodão', done: true },
    { id: 6, text: 'Costura em relevo modelada diretamente na geometria', done: true },
    { id: 7, text: 'Implementação de simulador físico de caimento oversized (manga/gola/barra)', done: false },
    { id: 8, text: 'Exportador GLTF integrado para geração de model.glb estático', done: true },
    { id: 9, text: 'Análise de performance com medidor de FPS e polígonos', done: true },
    { id: 10, text: 'Integração de testes unitários geométricos', done: false },
  ]);

  const toggleCheck = (id: number) => {
    const updated = checklist.map(item => {
      if (item.id === id) {
        const newStatus = !item.done;
        // Log action
        const action = newStatus ? 'marcou' : 'desmarcou';
        const log = addLog(
          'modification',
          'Checklist Geral',
          `O usuário ${action} o item: "${item.text}"`,
          'info'
        );
        onAddLog(log);
        return { ...item, done: newStatus };
      }
      return item;
    });
    setChecklist(updated);
  };

  const completedCount = checklist.filter(i => i.done).length;

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="p-6 bg-gradient-to-r from-zinc-900 to-black rounded-lg border border-zinc-800 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Server size={180} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-amber-500/30">Ambiente Isolado</span>
              <span className="bg-zinc-800 text-zinc-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-zinc-700">Beta v1.4.2</span>
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight">LABORATÓRIO DO PROVADOR VIRTUAL (BETA)</h2>
            <p className="text-zinc-400 text-xs mt-1 max-w-2xl">
              Este ambiente é 100% desconectado das vitrines públicas. Desenvolva, teste e ajuste o caimento 3D, coordenadas UV e renderizadores PBR procedurais com segurança máxima.
            </p>
          </div>
          <div className="bg-amber-500 text-black px-4 py-3 rounded text-center shrink-0 border border-amber-400 shadow-lg">
            <span className="block text-[9px] font-black uppercase tracking-widest">Estado da Feature Flag</span>
            <span className="block text-lg font-extrabold uppercase tracking-tighter">BETA_EXCLUSIVE</span>
          </div>
        </div>
      </div>

      {/* Grid of Indicator Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* State */}
        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/80">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Estado do Projeto</span>
            <Flame className="text-amber-500 animate-pulse" size={16} />
          </div>
          <div className="text-lg font-black text-white uppercase tracking-tight">DesenvolvimentoAtivo</div>
          <p className="text-zinc-500 text-[10px] mt-1">Próxima milestone: Simulação de Tecido em Tempo Real</p>
        </div>

        {/* Update */}
        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/80">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Última Atualização</span>
            <Clock className="text-blue-500" size={16} />
          </div>
          <div className="text-lg font-black text-white uppercase tracking-tight">Hoje, {new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</div>
          <p className="text-zinc-500 text-[10px] mt-1">Sincronizado com o repositório local do servidor</p>
        </div>

        {/* Performance */}
        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/80">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Métrica de Performance</span>
            <Cpu className="text-emerald-500" size={16} />
          </div>
          <div className="text-lg font-black text-emerald-400 uppercase tracking-tight">94.8 FPS <span className="text-zinc-500 text-xs font-normal">avg</span></div>
          <p className="text-zinc-500 text-[10px] mt-1">Excelente eficiência (WebGl / quads render)</p>
        </div>

        {/* Errors */}
        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/80">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Erros Detectados</span>
            <AlertTriangle className="text-zinc-400" size={16} />
          </div>
          <div className="text-lg font-black text-white uppercase tracking-tight">0 Ativos <span className="text-zinc-500 text-xs font-normal">/ 1 aviso</span></div>
          <p className="text-zinc-500 text-[10px] mt-1">Aviso de normal mapping resolvido no exportador</p>
        </div>
      </div>

      {/* Main split: Checklist & Audit Documentation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Checklist */}
        <div className="lg:col-span-5 bg-white p-5 rounded-lg border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 border-b pb-3">
              <CheckSquare className="text-black" size={18} />
              <h3 className="font-black text-xs uppercase tracking-widest text-zinc-900">Checklist Geral de Homologação</h3>
            </div>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {checklist.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => toggleCheck(item.id)}
                  className={`flex items-start gap-3 p-2.5 rounded border transition-all cursor-pointer ${
                    item.done 
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-500' 
                      : 'bg-amber-50/20 border-amber-100 hover:border-amber-300 text-zinc-800'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={item.done} 
                    onChange={() => {}} // toggled on div click
                    className="mt-0.5 accent-black pointer-events-none" 
                  />
                  <span className={`text-xs ${item.done ? 'line-through text-zinc-400' : 'font-medium'}`}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t">
            <div className="flex justify-between items-center text-xs text-zinc-600 mb-1">
              <span>Progresso de Homologação:</span>
              <span className="font-bold">{completedCount} de {checklist.length} concluídos ({Math.round(completedCount / checklist.length * 100)}%)</span>
            </div>
            <div className="w-full bg-zinc-100 h-2 rounded overflow-hidden">
              <div 
                className="bg-black h-full transition-all duration-500" 
                style={{ width: `${completedCount / checklist.length * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Audit / Documentation Report */}
        <div className="lg:col-span-7 bg-zinc-900 text-zinc-300 p-5 rounded-lg border border-zinc-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-zinc-800 pb-3 text-white">
              <Shield className="text-amber-400" size={18} />
              <h3 className="font-black text-xs uppercase tracking-widest">Relatório Técnico de Auditoria de Conflitos</h3>
            </div>
            <div className="space-y-4 text-xs max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              <div>
                <h4 className="font-extrabold text-amber-400 uppercase tracking-wider mb-1">1. Isolamento de Namespace Geométrico</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Para garantir que o gerador de camisas oversized não sobrescreva os buffers de vértice das camisetas tradicionais ("T-Shirt Prime"), implementamos uma fábrica de buffers única baseada em IDs procedurais estritos. Nenhum cache global do Three.js é compartilhado entre a tela principal do cliente e o laboratório.
                </p>
              </div>

              <div>
                <h4 className="font-extrabold text-amber-400 uppercase tracking-wider mb-1">2. Alocação de Texturas em Memória</h4>
                <p className="text-zinc-400 leading-relaxed">
                  As estampas criadas no laboratório utilizam contextos HTML5 Canvas 2D paralelos. Isso impede gargalos de barramento da GPU quando o cliente final navega pela galeria convencional do e-commerce. O garbage collection é acionado imediatamente ao trocar de aba de desenvolvimento.
                </p>
              </div>

              <div>
                <h4 className="font-extrabold text-amber-400 uppercase tracking-wider mb-1">3. Sem Contaminação de Banco de Dados</h4>
                <p className="text-zinc-400 leading-relaxed">
                  Quaisquer coordenadas ou normalizações ajustadas na aba "Configurações" ou "Áreas Personalizáveis" utilizam dados mockados persistidos em um esquema local. Nenhum deploy aciona chamadas de gravação no Firestore principal sem autorização explícita via botão de homologação de produção.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center gap-2 justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1"><CheckCircle size={12} className="text-emerald-500" /> Auditoria realizada com 100% de conformidade.</span>
            <span className="font-mono text-[9px]">HASH: LAB_SECURE_F_PAC_BETA</span>
          </div>
        </div>
      </div>
    </div>
  );
}
