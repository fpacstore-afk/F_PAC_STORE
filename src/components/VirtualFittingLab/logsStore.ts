import { AuditLog } from './types';

const STORAGE_KEY = 'f_pac_virtual_fitting_lab_logs';

const DEFAULT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 24 * 5).toLocaleString('pt-BR'),
    type: 'creation',
    component: 'VirtualFittingLab',
    description: 'Inicialização do ambiente de desenvolvimento isolado para o Provador Virtual Premium (Beta).',
    status: 'success',
    user: 'fpacstore@gmail.com'
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 3600000 * 24 * 4).toLocaleString('pt-BR'),
    type: 'modification',
    component: 'OversizedGeometryGenerator',
    description: 'Implementação de topologia limpa com Edge Loops otimizados para caimento oversized real.',
    status: 'success',
    user: 'fpacstore@gmail.com'
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 3600000 * 24 * 3.5).toLocaleString('pt-BR'),
    type: 'modification',
    component: 'UVUnwrapper',
    description: 'Configuração do unwrapper de coordenadas UV sem overlaps nas áreas frontal, traseira e gola.',
    status: 'success',
    user: 'fpacstore@gmail.com'
  },
  {
    id: 'log-4',
    timestamp: new Date(Date.now() - 3600000 * 24 * 3).toLocaleString('pt-BR'),
    type: 'modification',
    component: 'PBRMaterialEngine',
    description: 'Criação procedural de weaves de malha de algodão premium 260 GSM usando HTML5 Canvas em tempo de execução.',
    status: 'success',
    user: 'fpacstore@gmail.com'
  },
  {
    id: 'log-5',
    timestamp: new Date(Date.now() - 3600000 * 24 * 2).toLocaleString('pt-BR'),
    type: 'test_run',
    component: 'MeshValidator',
    description: 'Execução de testes de estresse geométrico: 32.400 polígonos detectados. Validação aprovada dentro do range ótimo.',
    status: 'success',
    user: 'fpacstore@gmail.com'
  },
  {
    id: 'log-6',
    timestamp: new Date(Date.now() - 3600000 * 24 * 1).toLocaleString('pt-BR'),
    type: 'error',
    component: 'GLTFExporter',
    description: 'Aviso de otimização de renderização: Normal maps necessitam de pre-multiplied alpha ativo na serialização.',
    status: 'warning',
    user: 'fpacstore@gmail.com'
  },
  {
    id: 'log-7',
    timestamp: new Date(Date.now() - 3600000 * 12).toLocaleString('pt-BR'),
    type: 'export',
    component: 'ModelGLB',
    description: 'Exportação bem-sucedida do modelo 3D "model.glb" procedural inicial com costura e caimento realistas.',
    status: 'success',
    user: 'fpacstore@gmail.com'
  }
];

export function getLogs(): AuditLog[] {
  if (typeof window === 'undefined') return DEFAULT_LOGS;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LOGS));
    return DEFAULT_LOGS;
  }
  try {
    return JSON.parse(stored);
  } catch (e) {
    return DEFAULT_LOGS;
  }
}

export function addLog(
  type: AuditLog['type'],
  component: string,
  description: string,
  status: AuditLog['status'] = 'info',
  user: string = 'fpacstore@gmail.com'
): AuditLog {
  const newLog: AuditLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toLocaleString('pt-BR'),
    type,
    component,
    description,
    status,
    user
  };

  const logs = getLogs();
  const updated = [newLog, ...logs];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newLog;
}

export function clearLogs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
}

export function resetLogs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LOGS));
}
