import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { QUESTIONS, calculateSimpleIdentity, type Collection, type Option } from '../../shared/simpleIdentity';
import { ownedSession } from '../services/ownedSession';
import { getPublicApiUrl } from '../lib/api';
import { analyticsAllowed } from '../services/privacyPreferences';

const RESULT_COPY: Record<Collection, { title: string; description: string; path: string }> = {
  force: {
    title: 'ESSENCIAL COM ATITUDE',
    description: 'Seu estilo combina com estampas pequenas e uma presença mais discreta. A FORCE é a sua linha.',
    path: '/catalog/all?line=force',
  },
  mark: {
    title: 'URBANO AUTÊNTICO',
    description: 'Você gosta de estampas grandes ou de mais de uma aplicação. A MARK combina com a sua vibe.',
    path: '/catalog/all?line=mark',
  },
  prime: {
    title: 'IDENTIDADE ÚNICA',
    description: 'Você não quer vestir igual a todo mundo. A PRIME deixa a peça com a sua assinatura.',
    path: '/prime',
  },
};

export function SimpleStyleQuiz() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Option[]>([]);
  const [finished, setFinished] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const selecting = useRef(false);
  const transitionTimer = useRef<number | undefined>(undefined);
  const startedAt = useRef(Date.now());
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const saveQuiz = (next: Option[], completed = false) => {
    if (!analyticsAllowed()) return;
    const session = ownedSession('identity');
    if (!session) return;
    const data = { status: completed ? 'completed' : 'started', currentStep: next.length, answers: Object.fromEntries(next.map((option, index) => [index + 1, option.id])), durationSeconds: Math.round((Date.now() - startedAt.current) / 1000) };
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      if (!analyticsAllowed()) return;
      await fetch(getPublicApiUrl('/api/identity/session'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.id, sessionToken: session.token, sequence: session.sequence, consent: true, quizVersion: 'simple-v1', data }), signal: AbortSignal.timeout(10_000) });
    }).catch(() => { /* Optional statistics do not block the result. */ });
  };
  const reset = () => {
    window.clearTimeout(transitionTimer.current);
    selecting.current = false; setTransitioning(false);
    startedAt.current = Date.now();
    if (analyticsAllowed()) ownedSession('identity', true);
    setStep(0); setAnswers([]); setFinished(false);
    saveQuiz([]);
  };

  useEffect(() => {
    const openQuiz = () => {
      reset();
      setOpen(true);
    };
    window.addEventListener('fpac_open_quiz', openQuiz);
    return () => window.removeEventListener('fpac_open_quiz', openQuiz);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const result = useMemo<Collection>(() => calculateSimpleIdentity(Object.fromEntries(answers.map((option, index) => [index + 1, option.id]))).collection, [answers]);

  const select = (option: Option) => {
    if (selecting.current) return;
    selecting.current = true; setTransitioning(true);
    const next = [...answers.slice(0, step), option];
    setAnswers(next);
    const completed = step === QUESTIONS.length - 1;
    saveQuiz(next, completed);
    if (step === QUESTIONS.length - 1) {
      setFinished(true);
      selecting.current = false; setTransitioning(false);
      try {
        localStorage.setItem('fpac_user_style', calculateSimpleIdentity(Object.fromEntries(next.map((item, index) => [index + 1, item.id]))).collection);
        window.dispatchEvent(new Event('fpac_style_changed'));
      } catch { /* The result still works with storage blocked. */ }
    } else {
      transitionTimer.current = window.setTimeout(() => { setStep(current => Math.min(QUESTIONS.length - 1, current + 1)); selecting.current = false; setTransitioning(false); }, 140);
    }
  };

  const back = () => {
    window.clearTimeout(transitionTimer.current); selecting.current = false; setTransitioning(false);
    if (finished) {
      if (analyticsAllowed()) ownedSession('identity', true);
      setFinished(false);
      setStep(QUESTIONS.length - 1);
      return;
    }
    if (step > 0) {
      setStep((current) => current - 1);
      setAnswers((current) => current.slice(0, -1));
    }
  };

  if (!open) return null;

  const progress = finished ? 100 : ((step + 1) / QUESTIONS.length) * 100;
  const resultCopy = RESULT_COPY[result];

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm p-0 sm:p-5 overflow-y-auto">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative min-h-[100dvh] sm:min-h-0 sm:max-w-xl sm:mx-auto sm:my-4 bg-[#08080c] text-white border border-white/10 sm:rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="h-1 bg-gradient-to-r from-[#eab308] via-[#fde047] to-[#eab308]" />
        <div className="px-5 sm:px-8 py-5 sm:py-7">
          <header className="flex items-center justify-between gap-4">
            <button onClick={back} disabled={!finished && step === 0} className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-white/50 disabled:opacity-0">
              <ChevronLeft size={17} /> Voltar
            </button>
            <div className="flex items-center gap-2 text-[#eab308] text-[11px] font-black uppercase tracking-[0.16em]">
              <Sparkles size={15} /> Identidade F PAC
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fechar" className="w-9 h-9 grid place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10">
              <X size={19} />
            </button>
          </header>

          <div className="mt-5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
            <span>{finished ? 'Resultado' : `Pergunta ${step + 1} de ${QUESTIONS.length}`}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div className="h-full bg-[#eab308]" animate={{ width: `${progress}%` }} />
          </div>

          <AnimatePresence mode="wait">
            {!finished ? (
              <motion.div key={step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} className="pt-8 pb-6">
                <p className="text-[#eab308] text-[10px] font-black tracking-[0.28em]">{QUESTIONS[step].eyebrow}</p>
                <h2 className="mt-2 text-3xl sm:text-4xl font-black italic uppercase leading-[1.05] max-w-md">{QUESTIONS[step].title}</h2>
                <p className="mt-3 text-sm text-white/45">Escolha sem pensar muito. A primeira resposta costuma ser a certa.</p>

                <div className="mt-8 grid gap-3">
                  {QUESTIONS[step].options.map((option) => (
                    <motion.button
                      key={option.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => select(option)}
                      disabled={transitioning}
                      className="group w-full min-h-[92px] p-4 sm:p-5 border border-white/10 bg-white/[0.025] hover:border-[#eab308]/70 hover:bg-[#eab308]/10 text-left flex items-center gap-4 transition-colors rounded-xl"
                    >
                      <span className="w-12 h-12 shrink-0 rounded-xl bg-white/5 grid place-items-center text-2xl group-hover:bg-[#eab308]/15">{option.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <strong className="block text-lg font-black uppercase tracking-wide">{option.title}</strong>
                        <span className="block mt-1 text-xs text-white/45">{option.subtitle}</span>
                      </span>
                      <span className="w-7 h-7 rounded-full border border-white/15 grid place-items-center text-white/30 group-hover:border-[#eab308] group-hover:text-[#eab308]">›</span>
                    </motion.button>
                  ))}
                </div>
                <p className="mt-7 text-center text-[10px] uppercase tracking-[0.22em] text-white/25">3 perguntas • menos de 20 segundos</p>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="py-10 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-[#eab308]/10 border border-[#eab308]/30 grid place-items-center text-3xl">{result === 'force' ? '◼️' : result === 'mark' ? '🔥' : '👑'}</div>
                <p className="mt-6 text-[#eab308] text-[10px] font-black tracking-[0.3em] uppercase">Seu estilo é</p>
                <h2 className="mt-2 text-4xl sm:text-5xl font-black italic uppercase leading-none">{resultCopy.title}</h2>
                <div className="mt-5 inline-flex px-4 py-2 border border-[#eab308]/30 bg-[#eab308]/10 text-[#eab308] font-black uppercase tracking-[0.2em] text-xs">Coleção {result.toUpperCase()}</div>
                <p className="mt-6 mx-auto max-w-sm text-sm sm:text-base text-white/55 leading-relaxed">{resultCopy.description}</p>
                <button
                  onClick={() => { setOpen(false); navigate(resultCopy.path); }}
                  className="mt-8 w-full bg-[#eab308] text-black py-4 px-6 rounded-xl font-black uppercase tracking-[0.15em] text-sm hover:bg-[#facc15] transition-colors"
                >
                  Ver minha seleção →
                </button>
                <button onClick={reset} className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white">Refazer teste</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </div>
  );
}
