import React, { useState } from 'react';
import { ShieldCheck, ArrowUpRight, CheckSquare, Loader2, Info } from 'lucide-react';
import { addLog } from '../logsStore';
import toast from 'react-hot-toast';

interface DeployTabProps {
  onAddLog: (log: any) => void;
}

export function DeployTab({ onAddLog }: DeployTabProps) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [featureFlag, setFeatureFlag] = useState('BETA_EXCLUSIVE');
  const [changelog, setChangelog] = useState('Moldagem oversized refinada com algodão penteado 260GSM e costuras direct-to-mesh.');

  const triggerDeploy = () => {
    setIsDeploying(true);
    const log1 = addLog('info', 'Deploy Manager', 'Iniciando pipeline de implantação na Sandbox Beta...', 'info');
    onAddLog(log1);

    setTimeout(() => {
      setIsDeploying(false);
      const log2 = addLog(
        'deploy', 
        'Ambiente de Produção (Simulado)', 
        `Novo Provador Virtual implantado sob a feature flag ${featureFlag}. Changelog: "${changelog}".`, 
        'success'
      );
      onAddLog(log2);
      toast.success('Alterações implantadas com sucesso no ambiente Beta!');
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Deploy Control Center */}
      <div className="bg-zinc-900 text-white p-5 rounded-lg border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-black text-xs uppercase tracking-widest text-amber-400">Gerenciador de Deploy & Feature Flags</h3>
          <p className="text-zinc-400 text-[11px] mt-0.5">Implante atualizações no ambiente de homologação sob feature flags seguras de infraestrutura.</p>
        </div>
        <div>
          <button 
            onClick={triggerDeploy}
            disabled={isDeploying}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest rounded border border-amber-600 shadow-md flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeploying ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Implantando...
              </>
            ) : (
              <>
                <ArrowUpRight size={14} /> Implantar Atualização Beta
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Settings Form */}
        <div className="lg:col-span-7 bg-white p-5 rounded-lg border border-zinc-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b pb-3 text-zinc-950">
            <ShieldCheck size={18} />
            <h3 className="font-black text-xs uppercase tracking-widest">Controles de Segurança de Lançamento</h3>
          </div>

          {/* Feature Flag Name */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">Nome da Feature Flag do Provador</label>
            <select 
              value={featureFlag}
              onChange={(e) => {
                setFeatureFlag(e.target.value);
                const log = addLog('modification', 'Feature Flags', `Nome da flag alterada para "${e.target.value}"`, 'info');
                onAddLog(log);
              }}
              className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-zinc-900 font-medium"
            >
              <option value="BETA_EXCLUSIVE">BETA_EXCLUSIVE (Apenas Administradores e Devs)</option>
              <option value="A_B_TEST_10">A_B_TEST_10 (10% de tráfego aleatório homologado)</option>
              <option value="DISABLED">DISABLED (Totalmente inativo na produção)</option>
            </select>
            <span className="text-[10px] text-zinc-400 mt-1 block">Protege contra visualização prematura por clientes normais.</span>
          </div>

          {/* Changelog description */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">Notas de Versão / Release Notes</label>
            <textarea 
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              rows={3}
              placeholder="Descreva as melhorias feitas..."
              className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-zinc-900"
            />
          </div>
        </div>

        {/* Sandbox safeguards (right) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-sm flex flex-col justify-between h-full">
            <div>
              <h4 className="font-black text-xs uppercase tracking-wider text-zinc-900 mb-3 border-b pb-2 flex items-center gap-1.5">
                <CheckSquare className="text-emerald-500" size={15} /> Salvaguardas do Ambiente Sandbox
              </h4>
              <p className="text-xs text-zinc-600 leading-relaxed mb-3">
                Para prevenir acidentes em escala de produção, o sistema de deploy isolado aplica regras rígidas de barreira:
              </p>
              <ul className="space-y-2 text-[11px] text-zinc-500 list-disc list-inside">
                <li>O código fonte cliente-final do e-commerce rejeita deploys que não possuam a chave de hash criptográfico <code>PROD_READY_SECURE</code>.</li>
                <li>Qualquer alteração visual realizada no laboratório é armazenada em cookies de desenvolvedor temporários.</li>
                <li>Nenhuma indexação por motores de busca (Google, Bing) é permitida nas páginas que possuem feature flag ativa.</li>
              </ul>
            </div>

            <div className="bg-zinc-50 p-3 rounded border border-zinc-200 text-[11px] text-zinc-500 flex items-start gap-1.5 mt-6">
              <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
              Sua sessão está devidamente autorizada pelo usuário administrador logado.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
