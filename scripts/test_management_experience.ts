import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_STAGE_TEMPLATES } from '../shared/productionNotificationDefaults';

const read = (file: string) => fs.readFileSync(file, 'utf8');

const admin = read('src/pages/AdminOrders.tsx');
assert.match(admin, /id: 'intelligence', label: 'Inteligência & CRM'/, 'deve existir uma única aba de Inteligência & CRM');
assert.doesNotMatch(admin, /id: 'history'/, 'a aba Histórias deve ser removida');
assert.doesNotMatch(admin, /id: 'analytics'/, 'Analytics não deve continuar como aba separada');
assert.doesNotMatch(admin, /id: 'automations'/, 'Automações não deve continuar como aba separada');
assert.match(admin, /value === 'analytics' \|\| value === 'automations'\) return 'intelligence'/, 'links antigos devem abrir a nova aba unificada');

const notificationUi = read('src/components/ProductionNotificationsAdmin.tsx');
assert.doesNotMatch(notificationUi, /Variáveis Dinâmicas Disponíveis|AVAILABLE_VARIABLES/, 'o painel não deve exibir a seção removida de variáveis');
assert.match(notificationUi, /finally \{\s*setIsLoading\(false\)/, 'o carregamento deve sempre ser encerrado');
for (const stage of ['separacao_corte', 'estamparia', 'embalagem', 'ready', 'completed']) {
  assert.ok(DEFAULT_STAGE_TEMPLATES[stage]?.includes('{{numero_pedido}}'), `a etapa ${stage} deve ter modelo automático completo`);
}
assert.ok(Object.values(DEFAULT_STAGE_TEMPLATES).every(template => template.includes('(47) 99756-5602')), 'todos os modelos devem usar o WhatsApp oficial correto');

const analytics = read('src/components/AdminAnalyticsDashboard.tsx');
const funnel = analytics.split('// 4. CONVERSION FUNNEL')[1]?.split('// 5. RANKINGS')[0] || '';
assert.doesNotMatch(funnel, /length \|\| 1/, 'o funil não pode inventar uma visita quando não há dados');
assert.match(analytics, /parseSessionDate/, 'datas inválidas devem ser tratadas explicitamente');

const musicAdmin = read('src/components/AdminMusic.tsx');
assert.doesNotMatch(musicAdmin, /formArtist|formAlbum|formCategory|formOrder|formCover/, 'o cadastro rápido não deve exigir metadados manuais');
assert.match(musicAdmin, /Do dispositivo/, 'deve permitir upload direto');
assert.match(musicAdmin, /Por link/, 'deve permitir cadastro por link');
assert.match(musicAdmin, /rightsConfirmed/, 'deve exigir autorização de uso');
const radioPage = read('src/pages/RadioPage.tsx');
assert.match(radioPage, /canDownloadTrack\(currentTrack\)/, 'download só deve aparecer para faixa autorizada');
assert.match(radioPage, /Baixar música/, 'a rádio pública deve oferecer download');

const home = read('src/pages/HomeV2.tsx');
assert.match(home, /instagram\/feed\?limit=5/, 'a Home deve pedir exatamente cinco feeds');
assert.match(home, /Array\.from\(\{ length: 5 \}\)/, 'o carregamento deve reservar cinco itens');
assert.match(home, /lg:grid-cols-5/, 'o grid deve apresentar cinco feeds no desktop');
const media = read('src/components/admin/AdminSiteMediaManager.tsx');
assert.doesNotMatch(media, /history_cards|communitySlots|communityMedia/, 'a Central de Mídias não deve manter a antiga vitrine de Histórias');
assert.match(media, /heroMobileUrl/, 'a Central deve controlar o Hero mobile separadamente');
assert.match(media, /instagram\/feed\?limit=5/, 'a Central deve diagnosticar a integração do Instagram');

const identity = read('src/components/AdminCustomerIdentity.tsx');
assert.match(identity, /timeScopedSessions/, 'os indicadores devem seguir apenas o período selecionado');
assert.match(identity, /sessionDate\(s\.createdAt\)\?\.toLocaleDateString/, 'o CSV deve aceitar Timestamp do Firestore');
assert.match(identity, /totalOptIns/, 'o painel deve mostrar opt-ins de marketing');

console.log('✅ Gestão, CRM, notificações, rádio, mídia e identidade: verificações aprovadas.');
