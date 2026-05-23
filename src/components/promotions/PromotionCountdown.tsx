import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface PromotionCountdownProps {
  endDate: string;
  onExpire?: () => void;
  className?: string;
  compact?: boolean;
}

export const PromotionCountdown: React.FC<PromotionCountdownProps> = ({
  endDate,
  onExpire,
  className = '',
  compact = false,
}) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    expired: false,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(endDate) - +new Date();
      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        expired: false,
      };
    };

    // Initial check
    const initial = calculateTimeLeft();
    setTimeLeft(initial);
    if (initial.expired && onExpire) {
      onExpire();
    }

    const timer = setInterval(() => {
      const calculated = calculateTimeLeft();
      setTimeLeft(calculated);
      
      if (calculated.expired) {
        clearInterval(timer);
        if (onExpire) onExpire();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [endDate, onExpire]);

  if (timeLeft.expired) {
    return null;
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#eab308] ${className}`}>
        <Timer size={12} className="animate-pulse text-red-500" />
        <span>Termina em:</span>
        <span className="font-mono bg-black/10 px-1 rounded">
          {timeLeft.days > 0 ? `${timeLeft.days}d ` : ''}
          {String(timeLeft.hours).padStart(2, '0')}:
          {String(timeLeft.minutes).padStart(2, '0')}:
          {String(timeLeft.seconds).padStart(2, '0')}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-2 select-none md:gap-4 ${className}`}>
      <div className="flex flex-col items-center">
        <span className="text-xl md:text-3xl font-black font-mono tracking-tight text-white bg-black/50 px-3 py-2 rounded-lg border border-white/5 min-w-[50px] text-center">
          {String(timeLeft.days).padStart(2, '0')}
        </span>
        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[#eab308] mt-1">Dias</span>
      </div>
      
      <span className="text-xl md:text-2xl font-black text-white/50 -mt-5">:</span>

      <div className="flex flex-col items-center">
        <span className="text-xl md:text-3xl font-black font-mono tracking-tight text-white bg-black/50 px-3 py-2 rounded-lg border border-white/5 min-w-[50px] text-center">
          {String(timeLeft.hours).padStart(2, '0')}
        </span>
        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[#eab308] mt-1">Horas</span>
      </div>

      <span className="text-xl md:text-2xl font-black text-white/50 -mt-5">:</span>

      <div className="flex flex-col items-center">
        <span className="text-xl md:text-3xl font-black font-mono tracking-tight text-white bg-black/50 px-3 py-2 rounded-lg border border-white/5 min-w-[50px] text-center">
          {String(timeLeft.minutes).padStart(2, '0')}
        </span>
        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[#eab308] mt-1">Min</span>
      </div>

      <span className="text-xl md:text-2xl font-black text-white/50 -mt-5">:</span>

      <div className="flex flex-col items-center">
        <span className="text-xl md:text-3xl font-black font-mono tracking-tight text-white bg-black/50 px-3 py-2 rounded-lg border border-white/5 min-w-[50px] text-center">
          {String(timeLeft.seconds).padStart(2, '0')}
        </span>
        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[#eab308] mt-1">Seg</span>
      </div>
    </div>
  );
};
