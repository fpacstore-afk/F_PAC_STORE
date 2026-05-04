import React, { useState, useEffect } from 'react';
import { useAuth, UserProfile } from '../context/AuthContext';
import { ShieldCheck, Loader2, Save, LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Account() {
  const { user, profile, loading, logout, updateProfile, loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<UserProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authName, setAuthName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setFormData(profile);
    } else if (user && !loading) {
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
  }, [user, profile, loading]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    try {
      if (authMode === 'login') {
        await loginWithEmail(authEmail, authPass);
      } else {
        await registerWithEmail(authEmail, authPass, authName);
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-white pt-40 pb-20 px-4 flex flex-col items-center">
        <div className="max-w-md w-full">
          <div className="text-center mb-10">
            <User size={48} className="text-gray-200 mx-auto mb-6" />
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-4">Minha Conta</h1>
            <p className="text-gray-500 max-w-sm mx-auto text-sm uppercase tracking-widest leading-relaxed">
              Acesse sua conta para gerenciar seus pedidos e dados de entrega.
            </p>
          </div>

          <div className="bg-black/5 border border-black/10 p-8 space-y-6">
            <div className="flex border-b border-black/10 mb-6">
              <button 
                onClick={() => setAuthMode('login')}
                className={cn(
                  "flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all",
                  authMode === 'login' ? "border-b-2 border-[#eab308] text-black" : "text-gray-400"
                )}
              >
                Entrar
              </button>
              <button 
                onClick={() => setAuthMode('register')}
                className={cn(
                  "flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all",
                  authMode === 'register' ? "border-b-2 border-[#eab308] text-black" : "text-gray-400"
                )}
              >
                Cadastrar
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Nome Completo</label>
                  <input 
                    required 
                    type="text" 
                    value={authName} 
                    onChange={(e) => setAuthName(e.target.value)} 
                    className="w-full bg-white border border-black/10 p-4 text-xs focus:outline-none focus:border-[#eab308]" 
                    placeholder="DIGITE SEU NOME"
                  />
                </div>
              )}
              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">E-mail</label>
                <input 
                  required 
                  type="email" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)} 
                  className="w-full bg-white border border-black/10 p-4 text-xs focus:outline-none focus:border-[#eab308]" 
                  placeholder="seu@email.com"
                />
              </div>
              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Senha</label>
                <input 
                  required 
                  type="password" 
                  value={authPass} 
                  onChange={(e) => setAuthPass(e.target.value)} 
                  className="w-full bg-white border border-black/10 p-4 text-xs focus:outline-none focus:border-[#eab308]" 
                  placeholder="******"
                />
              </div>

              {authMode === 'login' && (
                <button 
                  type="button"
                  onClick={() => authEmail ? resetPassword(authEmail) : alert('Digite seu e-mail primeiro')}
                  className="text-[8px] font-black uppercase text-gray-400 hover:text-black transition-colors block ml-auto"
                >
                  Esqueceu a senha?
                </button>
              )}

              <button 
                type="submit"
                disabled={isAuthLoading}
                className="w-full bg-black text-white font-black py-5 text-xs uppercase tracking-[0.2em] hover:bg-[#eab308] hover:text-black transition-all flex items-center justify-center gap-2"
              >
                {isAuthLoading ? <Loader2 className="animate-spin" size={16} /> : (authMode === 'login' ? 'Entrar' : 'Criar Conta')}
              </button>
            </form>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-black/10"></div></div>
              <div className="relative flex justify-center text-[8px] uppercase font-black bg-[#f9f9f9] px-4 text-gray-400">Ou continue com</div>
            </div>

            <button 
              onClick={() => loginWithGoogle()}
              className="w-full bg-white border border-black text-black font-black py-4 px-12 text-[10px] uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>
          </div>
        </div>
      </div>
    );
  }

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
