import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Flame, Activity, Smile, Shield, Minimize2, Crown, 
  Briefcase, Music, Clock, Sparkles, Eye, Sun, 
  ShieldAlert, Filter, Compass, TreePine, Maximize2, 
  Type, Square, Award, Heart, Key, Tag, 
  Layers, UserCheck, HeartHandshake, Anchor, XSquare, 
  Expand, Menu, Maximize, MessageSquare, Star, User, HelpCircle,
  X, ChevronRight, ChevronLeft, RefreshCw, Check, Copy, Share2, Play, Volume2, VolumeX, AlertCircle, Instagram
} from 'lucide-react';
import { cn } from '../lib/utils';
import { safeStorage } from '../lib/storage';
import { getPublicApiUrl } from '../lib/api';
import { ownedSession } from '../services/ownedSession';
import { useMusicPlayer } from '../hooks/useMusicPlayer';

// Sound synthesis helper using standard Web Audio API
function playSelectSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sine';
    // Elegant tech-pluck sound
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.1); // D6
    
    gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {
    console.debug('Audio context not allowed or blocked by browser policies.', e);
  }
}

const iconMap: Record<string, any> = {
  Flame, Activity, Smile, Shield, Minimize2, Crown, 
  Briefcase, Music, Clock, Sparkles, Eye, Sun, 
  ShieldAlert, Filter, Compass, TreePine, Maximize2, 
  Type, Square, Award, Heart, Key, Tag, 
  Layers, UserCheck, HeartHandshake, Anchor, XSquare, 
  Expand, Menu, Maximize, MessageSquare, Star, User, HelpCircle
};

export function LucideIcon({ name, className, size = 20 }: { name: string; className?: string; size?: number }) {
  const IconComponent = iconMap[name] || HelpCircle;
  return <IconComponent className={className} size={size} />;
}

export { QUESTIONS, PROFILES } from '../../shared/identityQuiz';
export type { StyleType, QuestionOption, Question, ProfileDetails } from '../../shared/identityQuiz';
import { QUESTIONS, PROFILES, calculateIdentity, type ProfileDetails, type StyleType } from '../../shared/identityQuiz';

interface StyleQuizProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export function StyleQuiz({ forceOpen = false, onClose }: StyleQuizProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();

  const { currentTrack, isPlaying, togglePlay, playTrack, filteredTracks } = useMusicPlayer();

  const startRadioDuringQuiz = () => {
    if (!isPlaying) {
      if (currentTrack) {
        togglePlay();
      } else if (filteredTracks && filteredTracks.length > 0) {
        playTrack(filteredTracks[0]);
      }
    }
  };

  // Primary States
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = start splash, 1-8 = Q1-Q8, 9 = Lead, 10 = Loading, 11 = Result
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [hasSound, setHasSound] = useState(true);

  // Lead capture states
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadWhatsapp, setLeadWhatsapp] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [leadError, setLeadError] = useState('');

  // Loaded/Computed results
  const [finalProfile, setFinalProfile] = useState<ProfileDetails | null>(null);
  const [finalScores, setFinalScores] = useState({ force: 0, mark: 0, prime: 0 });
  const [startTime, setStartTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Resume notification
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);

  const [saveError, setSaveError] = useState('');
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const lastSubmission = useRef<any>(null);

  const saveToFirebase = (data: any) => {
    const session = ownedSession('identity');
    if (!session) {
      if (data.status === 'completed') setSaveError('Seu resultado está disponível, mas não conseguimos salvar seu cadastro neste navegador.');
      return;
    }
    if (data.status === 'completed') lastSubmission.current = data;
    // Preserve answer ordering even when earlier requests take longer.
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      try {
        const response = await fetch(getPublicApiUrl('/api/identity/session'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.id, sessionToken: session.token, sequence: session.sequence, data }), signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error('save failed');
        if (data.status === 'completed') setSaveError('');
      } catch {
        if (data.status === 'completed') setSaveError('Seu resultado está disponível, mas o cadastro não foi confirmado. Tente salvar novamente.');
      }
    });
  };

  // Open conditions
  useEffect(() => {
    if (forceOpen) {
      startQuizFresh();
      return;
    }

    const savedResult = localStorage.getItem('fpac_identity_saved_result');
    const hasClosedQuiz = sessionStorage.getItem('fpac_session_quiz_closed');

    if (!savedResult && !hasClosedQuiz) {
      // Look for in-progress quiz
      const savedProgress = localStorage.getItem('fpac_identity_in_progress');
      if (savedProgress) {
        try {
          const parsed = JSON.parse(savedProgress);
          if (parsed && parsed.step > 0 && parsed.step < 11) {
            setShowResumeBanner(true);
          }
        } catch (_) {}
      }

      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [forceOpen]);

  // Listen to manual triggers
  useEffect(() => {
    const handleOpenQuiz = () => {
      startQuizFresh();
    };
    window.addEventListener('fpac_open_quiz', handleOpenQuiz);
    return () => {
      window.removeEventListener('fpac_open_quiz', handleOpenQuiz);
    };
  }, []);

  // Close on navigation
  useEffect(() => {
    if (isOpen && location.pathname !== '/descubra-sua-identidade') {
      setIsOpen(false);
    }
  }, [location.pathname]);


  // Reset/Start fresh
  const startQuizFresh = () => {
    ownedSession('identity', true);
    setOptIn(false);
    setSaveError('');
    localStorage.removeItem('fpac_identity_in_progress');
    setAnswers({});
    setCurrentStep(0);
    setIsOpen(true);
    setStartTime(Date.now());
    setLeadName('');
    setLeadEmail('');
    setLeadWhatsapp('');
    setShowResumeBanner(false);
    
    // Save starting event
    saveToFirebase({
      status: 'started',
      createdAt: new Date().toISOString(),
      currentStep: 0,
      answers: {}
    });
  };

  // Resume Progress
  const resumeQuizProgress = () => {
    const saved = localStorage.getItem('fpac_identity_in_progress');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAnswers(parsed.answers || {});
        setCurrentStep(parsed.step || 0);
        setStartTime(parsed.startTime || Date.now());
        setIsOpen(true);
        setShowResumeBanner(false);
        // Start playing site's radio when resuming
        startRadioDuringQuiz();
      } catch (_) {
        startQuizFresh();
      }
    } else {
      startQuizFresh();
    }
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem('fpac_session_quiz_closed', 'true');
    if (onClose) onClose();
  };

  // Sound selection toggle
  const selectOption = (questionId: number, optionId: string) => {
    if (hasSound) playSelectSound();

    const updatedAnswers = { ...answers, [questionId]: optionId };
    setAnswers(updatedAnswers);

    // Save transient progress
    localStorage.setItem('fpac_identity_in_progress', JSON.stringify({
      step: questionId + 1,
      answers: updatedAnswers,
      startTime
    }));

    // Save state to Firebase incrementally
    saveToFirebase({
      currentStep: questionId + 1,
      answers: updatedAnswers
    });

    // Advance with a brief elegant delay for interactive feedback
    setTimeout(() => {
      setCurrentStep(questionId + 1);
    }, 250);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Validate lead & Submit
  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail.trim()) || !/^\d{10,13}$/.test(leadWhatsapp.replace(/\D/g, ''))) {
      setLeadError('Confira seu nome, e-mail e WhatsApp.');
      return;
    }
    setLeadError('');
    proceedToComputation({
      name: leadName,
      email: leadEmail,
      whatsapp: leadWhatsapp,
      optIn
    });
  };

  const skipLead = () => {
    proceedToComputation();
  };

  const proceedToComputation = (leadData?: { name: string; email: string; whatsapp: string; optIn: boolean }) => {
    // Show premium Loading screen first
    setCurrentStep(10); // step 10 = loading screen

    const { profile: profileObj, scores: computedScores } = calculateIdentity(answers);
    const computedDuration = Math.round((Date.now() - startTime) / 1000);
    setFinalProfile(profileObj);
    setFinalScores(computedScores);
    setDuration(computedDuration);

    // Save final stats & completion to Firestore
    saveToFirebase({
      status: 'completed',
      completedAt: new Date().toISOString(),
      currentStep: 11,
      answers,
      lead: leadData || null,
      generatedProfile: profileObj.id,
      recommendedCollection: profileObj.recommendedCollection,
      durationSeconds: computedDuration,
      scores: computedScores
    });

    // Save completion flag & profile preference to local storage
    localStorage.setItem('fpac_user_style', profileObj.recommendedCollection);
    localStorage.setItem('fpac_identity_saved_result', JSON.stringify({
      profileId: profileObj.id,
      scores: computedScores
    }));
    // Clean up temporary active progress
    localStorage.removeItem('fpac_identity_in_progress');

    // Trigger local style change events so the app sintonizes
    window.dispatchEvent(new Event('fpac_style_changed'));

    // Loading transition delay
    setTimeout(() => {
      setCurrentStep(11); // step 11 = results screen
    }, 2000);
  };

  const handleCopyResult = () => {
    if (!finalProfile) return;
    const shareText = `Descobri minha Identidade Streetwear na F PAC STORE!\n\nPerfil: ${finalProfile.title}\n"${finalProfile.description}"\n\nDescubra seu estilo também.\nLink: ${window.location.origin}/descubra-sua-identidade`;
    navigator.clipboard.writeText(shareText);
    alert('Resultado copiado para a área de transferência! Cole onde desejar.');
  };

  const handleShareInstagram = () => {
    if (!finalProfile) return;
    const shareText = `Minha Identidade Streetwear na F PAC é: PERFIL ${finalProfile.name.toUpperCase()} ⚡️\n\nFaça o teste você também no site da F PAC!\nLink: ${window.location.origin}/descubra-sua-identidade`;
    navigator.clipboard.writeText(shareText);
    setShowInstagramModal(true);
  };

  const handleViewRecommendedProducts = () => {
    if (!finalProfile) return;
    setIsOpen(false);
    navigate(finalProfile.recommendedCollection === 'prime'
      ? '/prime'
      : `/catalog/all?line=${finalProfile.recommendedCollection}`);
    if (onClose) onClose();
  };

  // Countdown display format
  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isOpen) {
    if (showResumeBanner) {
      return (
        <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-6 z-[999] max-w-sm bg-[#0d0d12] border-2 border-[#eab308] p-4 text-white shadow-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#eab308] flex items-center gap-1">
              <Sparkles size={12} className="animate-pulse" />
              Teste em Progresso
            </span>
            <button onClick={() => setShowResumeBanner(false)} className="text-white/40 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-white/80">
            Você deixou sua experiência de identidade pela metade. Quer continuar de onde parou?
          </p>
          <div className="flex gap-2.5">
            <button 
              onClick={resumeQuizProgress}
              className="flex-1 bg-[#eab308] hover:bg-white text-black font-black py-1.5 px-3 text-[10px] uppercase tracking-widest transition-all"
            >
              Continuar
            </button>
            <button 
              onClick={startQuizFresh}
              className="border border-white/10 hover:border-white text-white font-black py-1.5 px-3 text-[10px] uppercase tracking-widest transition-all"
            >
              Recomeçar
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/95 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 md:p-6 select-none">
        
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-[#eab308]/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#eab308]/5 blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="relative w-full max-w-2xl bg-[#08080c] border border-white/10 p-5 sm:p-8 text-white shadow-2xl overflow-hidden my-4"
        >
          {/* Slogan premium top border */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#eab308] to-transparent" />
          <div className="absolute top-2 left-6 right-6 flex items-center justify-between text-white/20 pointer-events-none">
            <span className="text-[7px] font-mono tracking-[0.4em] uppercase">F PAC STORE</span>
            <span className="text-[7px] font-mono tracking-[0.4em] uppercase">Não é só roupa. É identidade.</span>
          </div>

          {/* Close Header button */}
          {currentStep !== 10 && (
            <>
              {/* Rádio F PAC Live Indicator */}
              <div className="absolute top-4 right-14 flex items-center gap-2 text-white/40 z-[99]">
                <button
                  onClick={togglePlay}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all duration-300 border border-white/5 hover:border-[#eab308]/40 hover:text-white cursor-pointer rounded-none",
                    isPlaying ? "bg-[#eab308]/10 text-[#eab308] border-[#eab308]/20 shadow-[0_0_15px_rgba(234,179,8,0.15)]" : "bg-black/60 text-white/40"
                  )}
                  title={isPlaying ? "Pausar Rádio do Site" : "Tocar Rádio do Site"}
                >
                  {isPlaying ? (
                    <>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#eab308] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#eab308]"></span>
                      </span>
                      <span>RÁDIO F PAC (AO VIVO)</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-white/20"></span>
                      <span>LIGAR RÁDIO F PAC</span>
                    </>
                  )}
                </button>
              </div>

              <button 
                onClick={handleClose}
                className="absolute top-3 right-3 text-white/40 hover:text-[#eab308] w-10 h-10 flex items-center justify-center transition-all cursor-pointer z-[99]"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </>
          )}

          {/* Control bar: Sound & Back */}
          {currentStep > 0 && currentStep < 9 && (
            <div className="absolute top-10 left-6 flex items-center gap-4 text-white/40 z-[99]">
              <button 
                onClick={handleBack} 
                className="hover:text-[#eab308] flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest bg-transparent border-0 cursor-pointer"
              >
                <ChevronLeft size={14} /> Voltar
              </button>
              <span className="text-white/10">|</span>
              <button 
                onClick={() => setHasSound(!hasSound)} 
                className="hover:text-[#eab308] flex items-center gap-1 bg-transparent border-0 cursor-pointer"
              >
                {hasSound ? <Volume2 size={13} className="text-[#eab308]" /> : <VolumeX size={13} />}
              </button>
            </div>
          )}

          <div className="pt-6 pb-2">
            
            {/* 1. START SPLASH SCREEN */}
            {currentStep === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center text-center py-6"
              >
                <div className="flex items-center gap-1.5 bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] mb-6 animate-pulse">
                  <Crown size={11} />
                  Experiência Exclusiva
                </div>

                <h1 className="text-3xl sm:text-5xl font-black italic tracking-tighter text-white mb-2 leading-none uppercase">
                  DESCUBRA SUA <span className="text-[#eab308] drop-shadow-[0_0_15px_rgba(234,179,8,0.2)]">IDENTIDADE</span>
                </h1>
                
                <h2 className="text-sm sm:text-base font-serif italic text-white/70 mb-8 font-medium">
                  “Não é só roupa. É identidade.”
                </h2>

                <p className="text-xs sm:text-sm text-white/60 font-sans max-w-md leading-relaxed mb-10">
                  Em menos de 30 segundos, nosso sistema inteligente de sintonia streetwear vai analisar seu estilo e revelar a coleção perfeita que traduz sua postura.
                </p>

                <div className="w-full flex flex-col items-center gap-4">
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      startRadioDuringQuiz();
                    }}
                    className="relative w-full max-w-sm bg-gradient-to-r from-[#eab308] to-[#ca8a04] hover:from-white hover:to-white text-black hover:text-black font-black py-4 px-8 text-xs uppercase tracking-[0.25em] transition-all duration-300 shadow-[0_4px_20px_rgba(234,179,8,0.35)] hover:shadow-white/20 active:scale-[0.98] cursor-pointer"
                  >
                    GARANTIR MEU DESCONTO
                  </button>
                </div>
              </motion.div>
            )}

            {/* 2. PROGRESSIVE QUESTIONS SCREEN */}
            {currentStep >= 1 && currentStep <= 8 && (
              <motion.div
                key={`step-${currentStep}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col mt-6"
              >
                {/* Progress Bar Header */}
                <div className="w-full flex flex-col gap-1.5 mb-8">
                  <div className="flex justify-between items-center text-[10px] font-mono text-white/50 tracking-widest uppercase">
                    <span>Identidade Streetwear</span>
                    <span className="text-[#eab308] font-black">Pergunta {currentStep} de 8</span>
                  </div>
                  <div className="w-full h-[3px] bg-white/10 overflow-hidden rounded-full">
                    <div 
                      className="h-full bg-[#eab308] transition-all duration-300 shadow-[0_0_10px_rgba(234,179,8,0.7)]" 
                      style={{ width: `${(currentStep / 8) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Question Title */}
                <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight mb-6">
                  {QUESTIONS[currentStep - 1].title}
                </h2>

                {/* Option Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
                  {QUESTIONS[currentStep - 1].options.map((opt) => {
                    const isSelected = answers[currentStep] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => selectOption(currentStep, opt.id)}
                        className={cn(
                          "group relative flex items-center justify-between p-4 bg-white/[0.02] border transition-all duration-300 rounded-none cursor-pointer text-left w-full h-[74px] active:scale-[0.99]",
                          isSelected 
                            ? "border-[#eab308] bg-[#eab308]/10 shadow-[0_0_20px_rgba(234,179,8,0.15)]" 
                            : "border-white/5 hover:border-white/20 hover:bg-white/[0.05]"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 flex items-center justify-center transition-all duration-300",
                            isSelected ? "text-[#eab308]" : "text-white/40 group-hover:text-white"
                          )}>
                            <LucideIcon name={opt.iconName} size={22} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-black uppercase tracking-widest text-white/40 group-hover:text-white/60 mb-0.5">
                              OPÇÃO {opt.id.toUpperCase().replace('_', ' ')}
                            </span>
                            <span className={cn(
                              "text-sm font-black uppercase tracking-wide transition-colors",
                              isSelected ? "text-[#eab308]" : "text-white group-hover:text-[#eab308]"
                            )}>
                              {opt.text}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl group-hover:scale-125 transition-transform duration-300">{opt.emoji}</span>
                          <div className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                            isSelected ? "border-[#eab308] bg-[#eab308]" : "border-white/20"
                          )}>
                            {isSelected && <Check size={10} className="text-black stroke-[3]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* 3. LEAD CAPTURE SCREEN */}
            {currentStep === 9 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col max-w-md mx-auto py-4"
              >
                <div className="text-center mb-6">
                  <div className="inline-flex p-3 bg-[#eab308]/10 rounded-full border border-[#eab308]/20 text-[#eab308] mb-3 animate-pulse">
                    <Sparkles size={28} />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter text-white">
                    QUASE PRONTO!
                  </h2>
                  <p className="text-xs text-white/50 mt-1 uppercase tracking-wider">
                    Sua identidade foi sintonizada. Onde devemos enviar seu resultado?
                  </p>
                </div>

                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                      Seu Nome Completo
                    </label>
                    <input 
                      type="text"
                      required
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      placeholder="Ex: Gabriel Silva"
                      className="w-full bg-white/[0.03] border border-white/10 focus:border-[#eab308] py-3.5 px-4 text-xs text-white rounded-none focus:outline-none transition-colors uppercase font-bold tracking-wider placeholder:text-white/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                      Seu Melhor E-mail
                    </label>
                    <input 
                      type="email"
                      required
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      placeholder="Ex: gabriel@email.com"
                      className="w-full bg-white/[0.03] border border-white/10 focus:border-[#eab308] py-3.5 px-4 text-xs text-white rounded-none focus:outline-none transition-colors font-bold tracking-wider placeholder:text-white/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                      Seu WhatsApp / Celular
                    </label>
                    <input 
                      type="tel"
                      required
                      value={leadWhatsapp}
                      onChange={(e) => setLeadWhatsapp(e.target.value)}
                      placeholder="Ex: (47) 99999-9999"
                      className="w-full bg-white/[0.03] border border-white/10 focus:border-[#eab308] py-3.5 px-4 text-xs text-white rounded-none focus:outline-none transition-colors font-bold tracking-wider placeholder:text-white/20"
                    />
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer group pt-1">
                    <input 
                      type="checkbox"
                      checked={optIn}
                      onChange={(e) => setOptIn(e.target.checked)}
                      className="mt-0.5 accent-[#eab308]"
                    />
                    <span className="text-[10px] text-white/60 group-hover:text-white transition-colors leading-relaxed uppercase tracking-wider font-semibold">
                      Aceito receber novidades e cupons exclusivos da F PAC STORE no meu WhatsApp e E-mail.
                    </span>
                  </label>

                  <div className="pt-4 flex flex-col gap-3">
                    <button
                      type="submit"
                      className="w-full bg-[#eab308] hover:bg-white text-black font-black py-4 text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-[0_4px_15px_rgba(234,179,8,0.25)] hover:shadow-white/20 cursor-pointer"
                    >
                      GERAR MEU RESULTADO
                    </button>
                    
                    <button
                      type="button"
                      onClick={skipLead}
                      className="text-center text-[10px] text-white/30 hover:text-[#eab308] font-black uppercase tracking-widest py-2 hover:underline transition-colors cursor-pointer"
                    >
                      Ver resultado sem cadastrar
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* 4. PREMIUM LOADING SCREEN */}
            {currentStep === 10 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center text-center py-12"
              >
                <div className="relative mb-8">
                  <div className="w-16 h-16 rounded-full border-4 border-white/5 border-t-[#eab308] animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-[#eab308]">
                    <Sparkles size={20} className="animate-pulse" />
                  </div>
                </div>

                <h3 className="text-lg font-black uppercase tracking-[0.2em] mb-2 animate-pulse text-[#eab308]">
                  SINTONIZANDO IDENTIDADE
                </h3>
                
                <div className="h-6 overflow-hidden max-w-xs mx-auto">
                  <motion.p 
                    initial={{ y: 20 }}
                    animate={{ y: [20, 0, -20] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                    className="text-[10px] font-mono text-white/40 uppercase tracking-widest"
                  >
                    Analisando caimento...
                  </motion.p>
                </div>
              </motion.div>
            )}

            {/* 5. FINAL RESULT SCREEN */}
            {currentStep === 11 && finalProfile && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col text-left"
              >
                {/* Result header layout */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center border-b border-white/5 pb-6 mb-6">
                  {/* Avatar section */}
                  <div className="md:col-span-4 flex flex-col items-center text-center">
                    <div className="relative p-1 border-2 border-[#eab308]/50 rounded-full bg-black/60 shadow-[0_0_30px_rgba(234,179,8,0.2)] animate-pulse">
                      <span className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-black to-[#0d0d12] flex items-center justify-center text-5xl sm:text-6xl select-none">
                        {finalProfile.emoji}
                      </span>
                      <div className="absolute -bottom-1 -right-1 bg-[#eab308] text-black text-[9px] font-black px-2.5 py-1 uppercase tracking-widest shadow-lg">
                        {finalProfile.badge.name.toUpperCase()}
                      </div>
                    </div>
                  </div>

                  {/* Profile info section */}
                  <div className="md:col-span-8 space-y-3 text-center md:text-left">
                    <span className="text-[9px] font-black bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/20 px-3 py-1 uppercase tracking-[0.25em]">
                      Sua Identidade Streetwear
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter text-white">
                      PERFIL {finalProfile.name.toUpperCase()}
                    </h2>
                    <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-medium">
                      {finalProfile.description}
                    </p>
                  </div>
                </div>

                {/* Compatibility stats & AI recommendation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-white/5 pb-6 mb-6">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Compatibilidade de Coleções</h3>
                    
                    {/* Collection compatibilities */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-mono uppercase text-white/80 mb-1">
                          <span>Linha FORCE (Estampa pequena)</span>
                          <span className={cn("font-bold", finalProfile.recommendedCollection === 'force' && "text-[#eab308]")}>
                            {finalScores.force}% {finalProfile.recommendedCollection === 'force' && '★'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/5 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${finalScores.force}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full", finalProfile.recommendedCollection === 'force' ? "bg-[#eab308]" : "bg-white/30")}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center text-[10px] font-mono uppercase text-white/80 mb-1">
                          <span>Linha MARK (Estampa grande ou múltipla)</span>
                          <span className={cn("font-bold", finalProfile.recommendedCollection === 'mark' && "text-[#eab308]")}>
                            {finalScores.mark}% {finalProfile.recommendedCollection === 'mark' && '★'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/5 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${finalScores.mark}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full", finalProfile.recommendedCollection === 'mark' ? "bg-[#eab308]" : "bg-white/30")}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center text-[10px] font-mono uppercase text-white/80 mb-1">
                          <span>Linha PRIME (Personalizável)</span>
                          <span className={cn("font-bold", finalProfile.recommendedCollection === 'prime' && "text-[#eab308]")}>
                            {finalScores.prime}% {finalProfile.recommendedCollection === 'prime' && '★'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/5 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${finalScores.prime}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full", finalProfile.recommendedCollection === 'prime' ? "bg-[#eab308]" : "bg-white/30")}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Recommendation panel */}
                  <div className="bg-white/[0.02] border border-white/5 p-4 flex flex-col justify-between">
                    <div>
                      <span className="text-[8px] font-black text-[#eab308] uppercase tracking-widest flex items-center gap-1.5 mb-2">
                        <Sparkles size={11} className="animate-pulse" /> Recomendações do Sistema
                      </span>
                      <p className="text-xs text-white/70 leading-relaxed font-sans italic">
                        "{finalProfile.aiText}"
                      </p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-white/5 flex items-center gap-2.5">
                      <span className="text-[18px]">{finalProfile.badge.emoji}</span>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase text-white/40 tracking-widest">Insígnia Conquistada</span>
                        <span className="text-[11px] font-black uppercase text-[#eab308] tracking-wider">{finalProfile.badge.name}</span>
                      </div>
                    </div>
                  </div>
                </div>


                {/* Recommended collection trigger & Social sharing */}
                {saveError && <div role="status" className="mb-4 rounded-lg border border-amber-500/40 p-3 text-sm text-amber-100">{saveError} {lastSubmission.current && <button type="button" className="mt-2 block underline" onClick={() => saveToFirebase(lastSubmission.current)}>Tentar salvar novamente</button>}</div>}
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button
                    onClick={handleViewRecommendedProducts}
                    className="flex-1 bg-[#eab308] hover:bg-white text-black font-black py-4 px-6 text-xs uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group cursor-pointer"
                  >
                    VER PRODUTOS ({finalProfile.recommendedCollection.toUpperCase()})
                    <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={handleShareInstagram}
                      title="Compartilhar no Instagram"
                      className="p-4 bg-[#E1306C]/10 hover:bg-[#E1306C]/20 border border-[#E1306C]/20 text-[#E1306C] transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Instagram size={16} />
                    </button>
                    
                    <button
                      onClick={handleCopyResult}
                      title="Copiar resultado"
                      className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Copy size={16} />
                    </button>

                    <button
                      onClick={startQuizFresh}
                      title="Refazer teste"
                      className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all cursor-pointer flex items-center justify-center"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <p className="text-[9px] text-white/30 uppercase tracking-widest leading-relaxed">
                    Poste seu resultado nos stories e marque <span className="text-[#eab308] font-bold">@f_pac_store</span> para ganhar outro benefício surpresa na sua próxima compra.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Instagram Instructions Modal Overlay */}
            <AnimatePresence>
              {showInstagramModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/95 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-6 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="w-full max-w-md bg-[#0d0d12] border border-[#E1306C]/40 p-6 relative"
                  >
                    {/* Close button */}
                    <button 
                      onClick={() => setShowInstagramModal(false)}
                      className="absolute top-3 right-3 text-white/40 hover:text-[#E1306C] w-8 h-8 flex items-center justify-center transition-all cursor-pointer"
                      title="Fechar"
                    >
                      <X size={16} />
                    </button>

                    {/* Instagram logo icon */}
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] rounded-2xl flex items-center justify-center text-white shadow-[0_4px_20px_rgba(238,42,123,0.3)]">
                      <Instagram size={32} />
                    </div>

                    <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-2 text-white">
                      Resultado Copiado!
                    </h3>
                    
                    <p className="text-[11px] text-white/70 leading-relaxed mb-6 font-medium max-w-xs mx-auto">
                      O texto do seu resultado já foi copiado para a sua área de transferência. Agora, siga os passos para garantir seu benefício surpresa:
                    </p>

                    <div className="space-y-4 text-left max-w-xs mx-auto mb-6 text-[11px] font-medium text-white/80">
                      <div className="flex gap-3 items-start">
                        <span className="w-5 h-5 rounded-full bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#E1306C] flex items-center justify-center font-black text-[9px] shrink-0 mt-0.5">1</span>
                        <p>Clique no botão abaixo para abrir o Instagram.</p>
                      </div>
                      <div className="flex gap-3 items-start">
                        <span className="w-5 h-5 rounded-full bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#E1306C] flex items-center justify-center font-black text-[9px] shrink-0 mt-0.5">2</span>
                        <p>Crie um novo <strong className="text-white uppercase font-black text-[9px]">Story</strong> e cole o resultado copiado ou tire um print desta tela.</p>
                      </div>
                      <div className="flex gap-3 items-start">
                        <span className="w-5 h-5 rounded-full bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#E1306C] flex items-center justify-center font-black text-[9px] shrink-0 mt-0.5">3</span>
                        <p>Marque <strong className="text-[#eab308] uppercase font-black text-[9px]">@f_pac_store</strong> e publique!</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <a
                        href="https://www.instagram.com"
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowInstagramModal(false)}
                        className="w-full py-3.5 bg-gradient-to-r from-[#ee2a7b] to-[#6228d7] hover:from-[#f9ce34] hover:to-[#ee2a7b] text-white hover:text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300 text-center block font-sans"
                      >
                        ABRIR INSTAGRAM
                      </a>
                      <button
                        onClick={() => setShowInstagramModal(false)}
                        className="text-[10px] font-black uppercase text-white/40 hover:text-white tracking-widest py-1.5 cursor-pointer"
                      >
                        Voltar para o resultado
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/* Elegant Recommendation banner to show personalization on the layouts */
export function StyleRecommendationBanner() {
  const navigate = useNavigate();
  const [style, setStyle] = useState<StyleType | null>(null);

  const loadStyle = () => {
    const saved = safeStorage.getItem('fpac_user_style') as StyleType | null;
    setStyle(saved);
  };

  useEffect(() => {
    loadStyle();
    
    // Listen to changes in style selection
    window.addEventListener('fpac_style_changed', loadStyle);
    return () => {
      window.removeEventListener('fpac_style_changed', loadStyle);
    };
  }, []);

  if (!style) return null;

  return (
    <div className="w-full bg-[#08080c] border-y border-white/10 py-3 px-4 md:px-8 text-white">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚡</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">
              Identidade Sintonizada:
            </span>
            <span className="bg-[#eab308] text-black font-black px-2 py-0.5 text-[9px] uppercase tracking-widest">
              {style.toUpperCase()}
            </span>
          </div>
          <p className="text-[10px] md:text-xs text-white/60 font-sans font-medium line-clamp-1 italic max-w-xl">
            Seu perfil combina com a linha {style.toUpperCase()}. Explore os produtos e encontre sua próxima peça.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={() => {
              navigate(`/model/${style}`);
            }}
            className="bg-[#eab308] hover:bg-white text-black text-[9px] font-black uppercase tracking-[0.15em] px-4 py-2 transition-all text-center rounded-none cursor-pointer"
          >
            Ver Coleção
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event('fpac_open_quiz'))}
            className="text-white/40 hover:text-[#eab308] text-[9px] font-black uppercase tracking-[0.15em] hover:underline transition-all flex items-center gap-1.5 bg-transparent border-0 cursor-pointer"
          >
            <RefreshCw size={10} />
            Mudar Estilo
          </button>
        </div>
      </div>
    </div>
  );
}
