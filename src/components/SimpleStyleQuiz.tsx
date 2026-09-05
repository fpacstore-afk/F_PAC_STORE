import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Collection = 'force' | 'mark' | 'prime';
type Scores = Record<Collection, number>;

type Option = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  scores: Scores;
};

type Question = {
  title: string;
  eyebrow: string;
  options: Option[];
};

const QUESTIONS: Question[] = [
  {
    eyebrow: 'SUA VIBE',
    title: 'Qual vibe combina mais com você?',
    options: [
      { id: 'discreto', emoji: '◼️', title: 'Discreto', subtitle: 'Limpo e sem exagero', scores: { force: 3, mark: 0, prime: 1 } },
      { id: 'urbano', emoji: '🔥', title: 'Urbano', subtitle: 'Street e cheio de atitude', scores: { force: 1, mark: 3, prime: 0 } },
      { id: 'marcante', emoji: '⚡', title: 'Marcante', subtitle: 'Quero algo só meu', scores: { force: 0, mark: 1, prime: 3 } },
    ],
  },
  {
    eyebrow: 'SEU LOOK',
    title: 'Como você gosta da sua roupa?',
    options: [
      { id: 'basica', emoji: '👌', title: 'Básica', subtitle: 'Fácil de combinar', scores: { force: 3, mark: 0, prime: 1 } },
      { id: 'equilibrada', emoji: '🎯', title: 'Equilibrada', subtitle: 'Presença na medida', scores: { force: 1, mark: 3, prime: 1 } },
      { id: 'personalidade', emoji: '✨', title: 'Com personalidade', subtitle: 'Diferente de todo mundo', scores: { force: 0, mark: 1, prime: 3 } },
    ],
  },
  {
    eyebrow: 'O QUE MANDA',
    title: 'O que mais importa no seu look?',
    options: [
      { id: 'conforto', emoji: '😎', title: 'Conforto', subtitle: 'Vestir bem sem esforço', scores: { force: 3, mark: 1, prime: 0 } },
      { id: 'estilo', emoji: '👟', title: 'Estilo', subtitle: 'Chegar com presença', scores: { force: 1, mark: 3, prime: 1 } },
      { id: 'exclusividade', emoji: '👑', title: 'Exclusividade', subtitle: 'Minha identidade, minhas regras', scores: { force: 0, mark: 1, prime: 3 } },
    ],
  },
];

const RESULT_COPY: Record<Collection, { title: string; description: string; path: string }> = {
  force: {
    title: 'ESSENCIAL COM ATITUDE',
    description: 'Seu estilo pede peças versáteis, fortes e fáceis de combinar. A FORCE é a sua base.',
    path: '/model/force',
  },
  mark: {
    title: 'URBANO AUTÊNTICO',
    description: 'Você gosta de presença sem perder a identidade. A MARK combina com a sua vibe.',
    path: '/model/mark',
  },
  prime: {
    title: 'IDENTIDADE ÚNICA',
    description: 'Você não quer vestir igual a todo mundo. A PRIME deixa a peça com a sua assinatura.',
    path: '/prime',
  },
};

const zeroScores = (): Scores => ({ force: 0, mark: 0, prime: 0 });

export function SimpleStyleQuiz() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Option[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const openQuiz = () => {
      setStep(0);
      setAnswers([]);
      setFinished(false);
      setOpen(true);
    };
    window.addEventListener('fpac_open_quiz', openQuiz);
    return () => window.removeEventListener('fpac_open_quiz', openQuiz);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const result = useMemo<Collection>(() => {
    const totals = answers.reduce<Scores>((acc, option) => ({
      force: acc.force + option.scores.force,
      mark: acc.mark + option.scores.mark,
      prime: acc.prime + option.scores.prime,
    }), zeroScores());
    return (Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'force') as Collection;
  }, [answers]);

  const select = (option: Option) => {
    const next = [...answers.slice(0, step), option];
    setAnswers(next);
    if (step === QUESTIONS.length - 1) {
      setFinished(true);
    } else {
      window.setTimeout(() => setStep((current) => current + 1), 140);
    }
  };

  const back = () => {
    if (finished) {
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
                <button onClick={() => { setStep(0); setAnswers([]); setFinished(false); }} className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white">Refazer teste</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </div>
  );
}
