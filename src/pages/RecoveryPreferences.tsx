import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { getPublicApiUrl } from '../lib/api';

export default function RecoveryPreferences() {
  const [credentials] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const valid = /^lead_[a-f0-9-]{36}$/.test(credentials.get('id') || '') && /^[a-f0-9]{64}$/.test(credentials.get('token') || '');
  const cancel = async () => {
    setStatus('saving');
    try {
      const response = await fetch(getPublicApiUrl('/api/checkout/recovery/cancel'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: credentials.get('id'), token: credentials.get('token') }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(response.status === 403 ? 'Este link não é válido. Abra o link recebido na mensagem.' : 'Não foi possível confirmar o cancelamento. Tente novamente.');
      setStatus('done');
      window.history.replaceState(null, '', window.location.pathname);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'A conexão demorou. Tente novamente para confirmar o cancelamento.');
    }
  };
  return <section className="mx-auto max-w-xl px-5 py-12 pb-40">
    <Helmet><title>Lembretes da sacola | F PAC STORE</title><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Helmet>
    <p className="text-xs font-bold uppercase tracking-widest text-yellow-700">F PAC STORE</p>
    <h1 className="mt-3 text-3xl font-black">Lembretes da sacola</h1>
    {status === 'done' ? <p role="status" className="mt-5">Cancelamento confirmado. Você não receberá novos lembretes desta sacola.</p> : <>
      <p className="mt-5 text-gray-600">Confirme abaixo para cancelar os lembretes desta sacola. Seus pedidos e mensagens de acompanhamento continuam normalmente.</p>
      {!valid && <p role="alert" className="mt-4 text-red-700">Abra o link de cancelamento recebido no WhatsApp ou e-mail.</p>}
      {status === 'error' && <p role="alert" className="mt-4 text-red-700">{message}</p>}
      <button disabled={!valid || status === 'saving'} onClick={cancel} className="mt-6 min-h-12 w-full rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50">{status === 'saving' ? 'Confirmando...' : 'Cancelar lembretes desta sacola'}</button>
    </>}
    <Link to="/produtos" className="mt-7 inline-block font-semibold underline">Voltar à loja</Link>
  </section>;
}
