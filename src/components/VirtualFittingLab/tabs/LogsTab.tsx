import React, { useState, useEffect } from 'react';
import { getLogs, clearLogs, resetLogs, addLog } from '../logsStore';
import { AuditLog } from '../types';
import { ShieldCheck, RefreshCw, Trash2, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface LogsTabProps {
  logs: AuditLog[];
  onLogsChange: (newLogs: AuditLog[]) => void;
}

export function LogsTab({ logs, onLogsChange }: LogsTabProps) {
  const handleClear = () => {
    clearLogs();
    onLogsChange([]);
    toast.success('Histórico de logs limpo com sucesso!');
  };

  const handleReset = () => {
    resetLogs();
    onLogsChange(getLogs());
    toast.success('Histórico restaurado para os logs de desenvolvimento padrão.');
  };

  const getStatusBadge = (status: AuditLog['status']) => {
    switch (status) {
      case 'success':
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">SUCESSO</span>;
      case 'warning':
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">AVISO</span>;
      case 'error':
        return <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">ERRO</span>;
      default:
        return <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">INFO</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-zinc-200 shadow-sm">
        <div>
          <h3 className="font-black text-xs uppercase tracking-widest text-zinc-900 flex items-center gap-1.5">
            <FileText size={16} /> Auditoria do Provador Virtual
          </h3>
          <p className="text-zinc-500 text-[10px] mt-0.5">Histórico completo de alterações e testes efetuados no ambiente de laboratório isolado.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleReset}
            className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-[10px] font-black uppercase tracking-wider rounded border border-zinc-200 flex items-center gap-1.5"
          >
            <RefreshCw size={11} /> Resetar Padrão
          </button>
          <button 
            onClick={handleClear}
            className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-red-600 hover:text-red-700 text-[10px] font-black uppercase tracking-wider rounded border border-zinc-200 flex items-center gap-1.5"
          >
            <Trash2 size={11} /> Limpar Logs
          </button>
        </div>
      </div>

      <div className="bg-zinc-950 rounded-lg border border-zinc-900 p-5 font-mono text-xs overflow-hidden shadow-inner">
        <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-900 pb-2 mb-3">
          <span>Marca Temporal</span>
          <span className="hidden md:inline">Componente</span>
          <span className="hidden md:inline">Usuário</span>
          <span>Status</span>
        </div>

        <div className="space-y-2 max-h-[450px] overflow-y-auto pr-2 scrollbar-thin">
          {logs.length === 0 ? (
            <p className="text-zinc-500 text-center py-12 italic">Nenhum registro de auditoria ativo na sandbox local.</p>
          ) : (
            logs.map(log => (
              <div key={log.id} className="p-3 bg-zinc-900/40 rounded border border-zinc-900 hover:bg-zinc-900/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-zinc-500 text-[10px]">{log.timestamp}</span>
                    <span className="text-zinc-300 font-extrabold uppercase text-[10px]">{log.component}</span>
                    <span className="md:hidden">{getStatusBadge(log.status)}</span>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed font-sans">{log.description}</p>
                </div>

                <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end">
                  <span className="text-[10px] text-zinc-500 hidden md:inline">{log.user}</span>
                  <div className="hidden md:inline">{getStatusBadge(log.status)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
