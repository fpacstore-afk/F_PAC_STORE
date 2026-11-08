import React, { useEffect, useRef, useState } from 'react';
import type { MultiFactorResolver } from 'firebase/auth';
import { completeTotpSignIn, totpFactors } from '../lib/authMfa';
import { authErrorMessage } from '../lib/authSecurity';

export function MfaChallenge({ resolver, onComplete, onCancel }: { resolver: MultiFactorResolver; onComplete: () => void; onCancel: () => void }) {
  const factors = totpFactors(resolver);
  const [factorUid, setFactorUid] = useState(factors[0]?.uid || '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    form.current?.querySelector('input')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [resolver]);
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-black/65 p-4">
    <form ref={form} role="dialog" aria-modal="true" aria-labelledby="mfa-title" className="w-full max-w-sm rounded-2xl bg-white p-6 text-black shadow-xl"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); }
        if (event.key === 'Tab') {
          const controls = Array.from(form.current?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)') || []);
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }} onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError('');
        try { await completeTotpSignIn(resolver, factorUid, code); setCode(''); onComplete(); }
        catch (error) { setError(authErrorMessage(error)); }
        finally { setBusy(false); }
      }}>
      <h2 id="mfa-title" className="text-xl font-bold">Confirme seu acesso</h2>
      <p className="mt-2 text-sm text-gray-600">Digite o código de 6 números do seu aplicativo autenticador.</p>
      {factors.length > 1 && <label className="mt-4 block text-sm">Autenticador<select disabled={busy} value={factorUid} onChange={event => setFactorUid(event.target.value)} className="mt-1 w-full rounded border p-3">{factors.map(factor => <option key={factor.uid} value={factor.uid}>{factor.displayName || 'Aplicativo autenticador'}</option>)}</select></label>}
      {factors.length ? <><label htmlFor="mfa-code" className="mt-4 block text-sm font-semibold">Código de verificação</label><input readOnly={busy} id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 min-h-12 w-full rounded border border-gray-400 p-3 text-xl tracking-widest" /></> : <p className="mt-4 text-sm">Esta conta exige outro tipo de segundo fator. Use o método de acesso configurado para ela.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex gap-3"><button type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded border px-4">Cancelar</button><button disabled={busy || !factors.length} className="min-h-12 flex-1 rounded bg-black px-4 font-bold text-white disabled:opacity-50">{busy ? 'Verificando…' : 'Confirmar acesso'}</button></div>
    </form>
  </div>;
}
