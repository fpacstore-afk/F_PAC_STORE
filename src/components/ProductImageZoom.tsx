import React, { useEffect, useId, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

/** Inspect the registered photograph without leaving the purchase page. */
export function ProductImageZoom({ src, title }: { src?: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!src) return null;
  const close = () => { setOpen(false); setZoomed(false); };

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Ampliar foto de ${title}`}
      className="absolute inset-0 z-10 cursor-zoom-in rounded-[2.5rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#9a7100]">
      <span className="absolute bottom-4 right-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 bg-white/95 px-4 text-xs font-bold text-black shadow-sm"><ZoomIn size={16} aria-hidden="true" /> Ampliar</span>
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={close} onClose={close}
      onClick={event => { if (event.target === event.currentTarget) close(); }}
      className="fixed inset-0 m-auto max-h-[94svh] w-[96vw] max-w-6xl overflow-hidden rounded-2xl border-0 bg-white p-0 text-black shadow-2xl backdrop:bg-black/75">
      <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2">
        <h2 id={titleId} className="min-w-0 truncate text-sm font-bold">Detalhes da peça</h2>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-pressed={zoomed} aria-label={zoomed ? 'Reduzir foto' : 'Aumentar foto'} onClick={() => setZoomed(value => !value)}
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5 focus-visible:outline focus-visible:outline-2">
            {zoomed ? <ZoomOut size={21} /> : <ZoomIn size={21} />}
          </button>
          <button type="button" aria-label="Fechar imagem ampliada" onClick={close} autoFocus
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5 focus-visible:outline focus-visible:outline-2"><X size={21} /></button>
        </div>
      </div>
      <div className="max-h-[calc(94svh-61px)] overflow-auto overscroll-contain bg-neutral-50">
        {open && <img src={src} alt={title} decoding="async" referrerPolicy="no-referrer"
          className={zoomed ? 'block h-auto w-[200%] max-w-none' : 'block h-[calc(88svh-61px)] w-full object-contain'}
          style={zoomed ? { minWidth: '1100px' } : undefined}
          onError={event => { if (!event.currentTarget.src.endsWith('/estampas/logo-fpac.png')) event.currentTarget.src = '/estampas/logo-fpac.png'; }} />}
      </div>
    </dialog>
  </>;
}
