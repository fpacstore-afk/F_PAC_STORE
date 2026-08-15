import React, { useState, useEffect } from 'react';
import { 
  Building2, Plus, Search, Mail, Phone, 
  CreditCard, Edit2, UserX, Check, X, 
  RefreshCw, FileText, CheckCircle2, AlertCircle
} from 'lucide-react';
import { authenticatedFetch } from '../../../lib/api';
import { Supplier } from '../../../types/financial';
import toast from 'react-hot-toast';

export function SuppliersManager() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    name: '',
    legalName: '',
    document: '',
    contactName: '',
    email: '',
    phone: '',
    pixKey: '',
    bankInfo: '',
    category: 'Malharia / Tecidos',
    notes: '',
    active: true
  });

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch('/api/admin/financial/suppliers');
      const data = await res.json();
      if (data.success && Array.isArray(data.suppliers)) {
        setSuppliers(data.suppliers);
      }
    } catch (err: any) {
      console.error('Erro ao buscar fornecedores:', err);
      toast.error('Erro ao carregar lista de fornecedores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const openCreateModal = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      legalName: '',
      document: '',
      contactName: '',
      email: '',
      phone: '',
      pixKey: '',
      bankInfo: '',
      category: 'Malharia / Tecidos',
      notes: '',
      active: true
    });
    setShowModal(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      legalName: supplier.legalName || '',
      document: supplier.document || '',
      contactName: supplier.contactName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      pixKey: supplier.pixKey || '',
      bankInfo: supplier.bankInfo || '',
      category: supplier.category || 'Malharia / Tecidos',
      notes: supplier.notes || '',
      active: supplier.active !== false
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome do fornecedor é obrigatório.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingSupplier) {
        // Update
        const res = await authenticatedFetch(`/api/admin/financial/suppliers/${editingSupplier.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || data.error || 'Erro ao atualizar fornecedor');
        }
        toast.success('Fornecedor atualizado com sucesso!');
      } else {
        // Create
        const idempotencyKey = `sup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const res = await authenticatedFetch('/api/admin/financial/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, idempotencyKey })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || data.error || 'Erro ao cadastrar fornecedor');
        }
        toast.success('Fornecedor cadastrado com sucesso!');
      }

      setShowModal(false);
      fetchSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao salvar fornecedor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente inativar o fornecedor "${name}"?`)) return;

    try {
      const res = await authenticatedFetch(`/api/admin/financial/suppliers/${id}/deactivate`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Erro ao inativar fornecedor');
      }
      toast.success('Fornecedor inativado com sucesso.');
      fetchSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao inativar fornecedor.');
    }
  };

  const filtered = suppliers.filter(s => {
    if (showActiveOnly && s.active === false) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const nameMatch = s.name?.toLowerCase().includes(term);
      const docMatch = s.document?.toLowerCase().includes(term);
      const catMatch = s.category?.toLowerCase().includes(term);
      const contactMatch = s.contactName?.toLowerCase().includes(term);
      if (!nameMatch && !docMatch && !catMatch && !contactMatch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-5 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            Cadastro & Gestão de Fornecedores
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Controle de parceiros comerciais, malharias, estamparias, logística e dados bancários para PIX / TED.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSuppliers}
            disabled={loading}
            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-lg transition shadow-lg shadow-amber-500/10"
          >
            <Plus className="w-4 h-4" />
            Novo Fornecedor
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-neutral-900/50 border border-neutral-800 p-3 rounded-xl">
        <div className="flex flex-1 items-center gap-2 w-full md:w-auto bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
          <Search className="w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar por nome fantasia, CNPJ/CPF, categoria ou contato..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-sm text-white placeholder-neutral-500 outline-none w-full"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-neutral-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={(e) => setShowActiveOnly(e.target.checked)}
            className="rounded border-neutral-700 text-amber-500 focus:ring-amber-500 bg-neutral-950"
          />
          Exibir somente ativos
        </label>
      </div>

      {/* Grid of suppliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-neutral-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
            Carregando fornecedores...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-neutral-500 bg-neutral-900/40 border border-neutral-800 rounded-xl">
            Nenhum fornecedor encontrado.
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              className={`bg-neutral-900 border ${s.active === false ? 'border-red-900/40 opacity-70' : 'border-neutral-800 hover:border-neutral-700'} p-5 rounded-xl transition flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white text-base">{s.name}</h3>
                    {s.legalName && (
                      <p className="text-xs text-neutral-400 mt-0.5">{s.legalName}</p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 text-[11px] font-semibold rounded ${s.active !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {s.active !== false ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-neutral-300">
                  {s.category && (
                    <div className="inline-block px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-[11px] mb-1">
                      {s.category}
                    </div>
                  )}

                  {s.document && (
                    <div className="flex items-center gap-2 text-neutral-400">
                      <FileText className="w-3.5 h-3.5 text-neutral-500" />
                      <span className="font-mono text-neutral-300">{s.document}</span>
                    </div>
                  )}

                  {s.contactName && (
                    <div className="flex items-center gap-2 text-neutral-400">
                      <span className="text-neutral-500">Contato:</span>
                      <span className="text-neutral-200">{s.contactName}</span>
                    </div>
                  )}

                  {s.phone && (
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Phone className="w-3.5 h-3.5 text-neutral-500" />
                      <span>{s.phone}</span>
                    </div>
                  )}

                  {s.email && (
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Mail className="w-3.5 h-3.5 text-neutral-500" />
                      <span className="truncate">{s.email}</span>
                    </div>
                  )}

                  {s.pixKey && (
                    <div className="flex items-center gap-2 text-amber-400/90 font-mono text-[11px] bg-neutral-950 p-2 rounded border border-neutral-800 mt-2">
                      <CreditCard className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">PIX: {s.pixKey}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-end gap-2">
                <button
                  onClick={() => openEditModal(s)}
                  className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs font-medium flex items-center gap-1 transition"
                >
                  <Edit2 className="w-3 h-3" /> Editar
                </button>
                {s.active !== false && (
                  <button
                    onClick={() => handleDeactivate(s.id, s.name)}
                    className="p-1.5 text-neutral-500 hover:text-red-400 rounded transition"
                    title="Inativar Fornecedor"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Nome Fantasia / Identificação *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Têxtil Santa Catarina Ltda"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Razão Social
                  </label>
                  <input
                    type="text"
                    value={formData.legalName}
                    onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    CNPJ / CPF
                  </label>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={formData.document}
                    onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Categoria
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  >
                    <option value="Malharia / Tecidos">Malharia / Tecidos</option>
                    <option value="Estamparia / Tintas">Estamparia / Tintas</option>
                    <option value="Costura / Confecção">Costura / Confecção</option>
                    <option value="Embalagens & Tags">Embalagens & Tags</option>
                    <option value="Logística & Transportes">Logística & Transportes</option>
                    <option value="Software & Infra">Software & Infra</option>
                    <option value="Serviços Profissionais">Serviços Profissionais</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Nome do Contato
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Carlos Representante"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="financeiro@fornecedor.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Chave PIX
                  </label>
                  <input
                    type="text"
                    placeholder="CNPJ, e-mail ou aleatória"
                    value={formData.pixKey}
                    onChange={(e) => setFormData({ ...formData, pixKey: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                    Dados Bancários
                  </label>
                  <input
                    type="text"
                    placeholder="Banco, Agência e Conta"
                    value={formData.bankInfo}
                    onChange={(e) => setFormData({ ...formData, bankInfo: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Anotações Internas
                </label>
                <textarea
                  rows={2}
                  placeholder="Prazos de entrega médios, limites de crédito, descontos negociados..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                />
              </div>

              {editingSupplier && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="supplierActive"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded border-neutral-700 text-amber-500 focus:ring-amber-500 bg-neutral-950"
                  />
                  <label htmlFor="supplierActive" className="text-xs text-neutral-300 cursor-pointer">
                    Fornecedor Ativo no Sistema
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm transition shadow-lg shadow-amber-500/10 flex items-center gap-2"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editingSupplier ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
