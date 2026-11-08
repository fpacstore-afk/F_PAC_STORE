import React, { useState } from 'react';
import { EmailAuthProvider, GoogleAuthProvider, TotpMultiFactorGenerator, multiFactor, reauthenticateWithCredential, reauthenticateWithPopup, sendEmailVerification, type TotpSecret, type User } from 'firebase/auth';
import QRCode from 'qrcode';
import { auth } from '../lib/firebase';
import { authErrorMessage } from '../lib/authSecurity';

/** Enrollment happens only after the account owner confirms a code on their own device. */
export function AccountSecurity({ user }: { user: User }) {
  const [enrolled, setEnrolled] = useState(() => multiFactor(user).enrolledFactors.some(factor => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID));
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const hasGoogle = user.providerData.some(provider => provider.providerId === 'google.com');
  const clear = () => { setSecret(null); setQr(''); setCode(''); setPassword(''); };
  const current = () => auth.currentUser?.uid === user.uid;
  return <details className="mb-6 rounded-xl border border-black/10 bg-white p-5">
    <summary className="cursor-pointer font-bold">Segurança da conta</summary>
    <p className="mt-3 text-sm">{enrolled ? 'Verificação em duas etapas ativada com aplicativo autenticador.' : 'Proteja seu acesso com um código do Google Authenticator ou outro aplicativo autenticador.'}</p>
    {!enrolled && (!user.emailVerified ? <><p className="mt-3 text-sm text-gray-600">Confirme seu e-mail antes de configurar a verificação em duas etapas. Depois, entre novamente.</p><button disabled={busy} className="mt-3 min-h-12 rounded border px-4" onClick={async () => { setBusy(true); try { await sendEmailVerification(user); setMessage('Enviamos as instruções para confirmar seu e-mail.'); } catch (error) { setMessage(authErrorMessage(error)); } finally { setBusy(false); } }}>Enviar confirmação de e-mail</button></> : secret ? <form className="mt-4 space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy || !current()) return; setBusy(true); setMessage('');
      try { await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'Aplicativo autenticador'); await user.getIdToken(true); clear(); setEnrolled(true); setMessage('Verificação em duas etapas ativada.'); }
      catch (error) { setMessage(authErrorMessage(error)); }
      finally { setBusy(false); }
    }}>
      <p className="text-sm">No seu autenticador, adicione uma conta usando este QR code. Confirme abaixo o código que aparecer no aplicativo.</p>
      {qr && <img src={qr} alt="QR code para adicionar sua conta ao autenticador" width={224} height={224} className="max-w-full" />}
      <details><summary className="cursor-pointer text-sm">Digitar a chave manualmente</summary><code className="mt-2 block break-all rounded bg-gray-100 p-3">{secret.secretKey}</code></details>
      <label htmlFor="enroll-mfa-code" className="block text-sm font-semibold">Código do autenticador</label><input id="enroll-mfa-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="min-h-12 w-full rounded border p-3" />
      <div className="flex flex-wrap gap-3"><button disabled={busy} className="min-h-12 rounded bg-black px-4 font-bold text-white">{busy ? 'Confirmando…' : 'Ativar verificação em duas etapas'}</button><button type="button" disabled={busy} className="min-h-12 rounded border px-4" onClick={clear}>Cancelar configuração</button></div>
    </form> : <form className="mt-4 space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy || !current()) return; setBusy(true); setMessage('');
      try {
        if (hasGoogle) await reauthenticateWithPopup(user, new GoogleAuthProvider());
        else await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, password));
        setPassword(''); if (!current()) return;
        const pending = await TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession());
        const image = await QRCode.toDataURL(pending.generateQrCodeUrl(user.email!, 'F PAC STORE'), { width: 224, margin: 2 });
        if (current()) { setSecret(pending); setQr(image); }
      } catch (error) { setMessage(authErrorMessage(error)); }
      finally { setPassword(''); setBusy(false); }
    }}>
      {!hasGoogle && <><label htmlFor="security-current-password" className="block text-sm">Confirme sua senha atual</label><input id="security-current-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="min-h-12 w-full rounded border p-3" /></>}
      <button disabled={busy} className="min-h-12 rounded bg-black px-4 font-bold text-white">{busy ? 'Preparando…' : hasGoogle ? 'Confirmar com Google e configurar autenticador' : 'Configurar autenticador'}</button>
    </form>)}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </details>;
}
