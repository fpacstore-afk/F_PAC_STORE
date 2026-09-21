import React, { useState } from 'react';
import { Activity, BarChart3, Bot, RefreshCw } from 'lucide-react';
import AdminAnalyticsDashboard from './AdminAnalyticsDashboard';
import { AdminAutomations } from './AdminAutomations';
import { cn } from '../lib/utils';

type IntelligenceView = 'analytics' | 'crm';

export default function AdminIntelligenceCRM() {
  const [view, setView] = useState<IntelligenceView>('analytics');

  return (
    <div className="space-y-4">
      <div className="bg-black text-white border-b-2 border-[#eab308] px-4 py-5 md:px-8 md:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/45">
              <Activity size={14} className="text-[#eab308]" /> Central de decisão
            </div>
            <h1 className="mt-2 text-2xl font-black uppercase italic tracking-tight md:text-3xl">
              Inteligência <span className="text-[#eab308]">& CRM</span>
            </h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/55 md:text-sm">
              Jornada, conversão e recuperação comercial em uma única área, sem indicadores duplicados.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 border border-white/10 bg-white/5 p-1" role="tablist" aria-label="Visões de inteligência e CRM">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'analytics'}
              onClick={() => setView('analytics')}
              className={cn('flex min-h-11 items-center justify-center gap-2 px-4 text-[9px] font-black uppercase tracking-wider transition-colors', view === 'analytics' ? 'bg-[#eab308] text-black' : 'text-white/60 hover:text-white')}
            >
              <BarChart3 size={14} /> Jornada & conversão
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'crm'}
              onClick={() => setView('crm')}
              className={cn('flex min-h-11 items-center justify-center gap-2 px-4 text-[9px] font-black uppercase tracking-wider transition-colors', view === 'crm' ? 'bg-[#eab308] text-black' : 'text-white/60 hover:text-white')}
            >
              <Bot size={14} /> Recuperação CRM
            </button>
          </div>
        </div>
      </div>

      <div role="tabpanel">
        {view === 'analytics' ? <AdminAnalyticsDashboard embedded /> : <AdminAutomations embedded />}
      </div>
    </div>
  );
}
