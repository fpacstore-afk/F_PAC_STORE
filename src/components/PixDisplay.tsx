import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { fetchPaymentStatus } from '../services/paymentStatus';
import { paymentOutcome } from '../../shared/paymentOutcome';

export function PixDisplay({ pixResult, onApproved }: { pixResult: any; onApproved: (result: any) => void }) {
  const [status, setStatus] = useState(pixResult.status || 'pending');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const qrCode = pixResult.point_of_interaction?.transaction_data?.qr_code || '';
  const qrBase64 = pixResult.point_of_interaction?.transaction_data?.qr_code_base64;
  const outcome = paymentOutcome(status);
  const trackingLink = '/order/' + encodeURIComponent(pixResult.external_reference) + (pixResult.trackingAccessToken ? '?token=' + encodeURIComponent(pixResult.trackingAccessToken) : '');

  useEffect(() => {
    let active = true;
    if (qrBase64) setQrImage('data:image/png;base64,' + qrBase64);
    else if (qrCode) QRCode.toDataURL(qrCode, { width: 256, margin: 2 }).then(url => { if (active) setQrImage(url); }).catch(() => { if (active) setQrImage(''); });
    return () => { active = false; };
  }, [qrBase64, qrCode]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let failures = 0;
    const started = Date.now();
    const check = async () => {
      if (stopped || !pixResult.external_reference) return;
      if (document.visibilityState !== 'hidden') {
        try {
          const data = await fetchPaymentStatus(pixResult.external_reference, pixResult.trackingAccessToken, controller.signal);
          if (stopped) return;
          failures = 0;
          setError('');
          setStatus(data.paymentStatus);
          const next = paymentOutcome(data.paymentStatus);
          if (next === 'approved') { stopped = true; onApproved({ ...pixResult, status: 'approved' }); return; }
          if (next !== 'pending') { stopped = true; return; }
        } catch (e) {
          if (stopped) return;
          failures++;
          setError(e instanceof Error ? e.message : 'Falha na consulta.');
        }
      }
      if (Date.now() - started > 15 * 60_000 || failures >= 3) {
        setError('Consulta automática pausada. Abra o acompanhamento do pedido para verificar o pagamento.');
        return;
      }
      timer = setTimeout(check, 10_000);
    };
    void check();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [pixResult.external_reference, pixResult.trackingAccessToken, onApproved]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(qrCode); setCopied(true); toast.success('Código PIX copiado!'); }
    catch { toast.error('Não foi possível copiar. Selecione o código abaixo e copie manualmente.'); }
  };

  return <section className="rounded-2xl border border-[#f7c600]/40 p-5 text-center space-y-5" aria-label="Pagamento PIX">
    <h3 className="font-black text-[#f7c600] uppercase" aria-live="polite">{outcome === 'approved' ? 'Pagamento aprovado' : outcome === 'failed' ? 'Pagamento encerrado' : outcome === 'refunded' ? 'Pagamento estornado' : 'Aguardando pagamento'}</h3>
    {outcome === 'pending' && <>
      {qrImage && <img src={qrImage} alt="QR Code do PIX deste pedido" className="mx-auto w-52 rounded-xl bg-white p-2" />}
      {qrCode ? <>
        <label className="block text-left text-xs font-bold">PIX copia e cola
          <textarea readOnly value={qrCode} rows={3} onFocus={event => event.target.select()} className="mt-2 w-full rounded-lg bg-white/5 border border-white/15 p-3 text-xs font-mono break-all" />
        </label>
        <button type="button" onClick={() => void copy()} className="min-h-12 w-full rounded-xl bg-[#f7c600] px-4 py-3 text-black text-sm font-black inline-flex items-center justify-center gap-2"><Copy size={17} />{copied ? 'Código copiado' : 'Copiar código PIX'}</button>
        <p className="text-xs text-white/65">Use o código deste pedido e confira o valor e o recebedor no aplicativo do banco antes de pagar.</p>
      </> : <p role="alert" className="text-sm text-amber-200">O código PIX não está disponível. Consulte o pedido antes de tentar pagar novamente.</p>}
      {!error && <p className="flex items-center justify-center gap-2 text-xs text-white/65"><Loader2 size={15} className="animate-spin" />Consultando confirmação</p>}
    </>}
    {outcome === 'approved' && <CheckCircle2 className="mx-auto text-green-400" size={40} />}
    {outcome === 'failed' && <p className="text-sm text-white/70">Esta cobrança foi recusada, cancelada ou expirou. Consulte o pedido antes de iniciar uma nova compra.</p>}
    {error && <p role="status" className="text-xs text-amber-200">{error}</p>}
    <Link to={trackingLink} className="block min-h-11 rounded-lg border border-white/20 p-3 text-sm font-bold">Acompanhar pedido</Link>
  </section>;
}
