import React, { useState, useEffect } from 'react';
import { useAuth, UserProfile } from '../context/AuthContext';
import { ShieldCheck, Loader2, Save, LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Account() {
  const { user, profile, loading, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<UserProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/checkout');
    }
    if (profile) {
      setFormData(profile);
    } else if (user && !loading) {
      // Fallback if profile exists but wasn't loaded for some reason
      setFormData({
        name: user.displayName || '',
        email: user.email || '',
        phone: '',
        cpf: '',
        address: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        cep: ''
      });
    }
  }, [user, profile, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#eab308]" size={32} />
      </div>
    );
  }

  if (!formData) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => prev ? ({ ...prev, [name]: value }) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await updateProfile(formData);
      setMessage({ type: 'success', text: 'Dados atualizados com sucesso!' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Erro ao atualizar dados. Tente novamente.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pt-32 pb-20 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">Minha Conta</h1>
            <p className="text-gray-500 text-sm">{user?.email}</p>
          </div>
          <button 
            onClick={() => logout().then(() => navigate('/'))}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors"
          >
            <LogOut size={14} /> Sair da Conta
          </button>
        </div>

        <div className="bg-black/5 border border-black/10 p-8">
          <div className="flex items-center gap-3 mb-8 pb-4 border-b border-black/5">
            <User size={20} className="text-[#eab308]" />
            <h2 className="font-black uppercase text-sm tracking-widest">Dados de Entrega</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Nome Completo</label>
                <input required type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">WhatsApp</label>
                <input required type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" placeholder="(00) 00000-0000" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">CPF</label>
                <input required type="text" name="cpf" value={formData.cpf} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
              <div className="md:col-span-2 mt-4 pt-4 border-t border-black/5">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">CEP</label>
                <input required type="text" name="cep" value={formData.cep} onChange={handleInputChange} className="w-64 bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Endereço</label>
                <input required type="text" name="address" value={formData.address} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Número</label>
                <input required type="text" name="number" value={formData.number} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Complemento</label>
                <input type="text" name="complement" value={formData.complement} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Bairro</label>
                <input required type="text" name="neighborhood" value={formData.neighborhood} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Cidade</label>
                <input required type="text" name="city" value={formData.city} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Estado</label>
                <input required type="text" name="state" value={formData.state} onChange={handleInputChange} className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]" />
              </div>
            </div>

            {message && (
              <div className={`p-4 text-[10px] font-bold uppercase tracking-widest ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-[#eab308] text-black font-black py-5 text-sm uppercase tracking-[0.2em] hover:bg-black hover:text-[#eab308] transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Salvar Dados</>}
            </button>
          </form>

          <p className="text-center text-[10px] text-gray-400 mt-8 flex items-center justify-center gap-2">
            <ShieldCheck size={14} /> Seus dados estão protegidos por criptografia de ponta a ponta.
          </p>
        </div>
      </div>
    </div>
  );
}
