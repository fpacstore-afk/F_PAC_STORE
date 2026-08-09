import React, { createContext, useContext, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface FinancialPrivacyContextType {
  showFinancialValues: boolean;
  toggleFinancialVisibility: () => void;
  formatMoney: (
    amount: number | string | null | undefined,
    options?: { showCurrencySymbol?: boolean; forceShow?: boolean }
  ) => string;
  formatPercent: (
    percentage: number | string | null | undefined,
    options?: { forceShow?: boolean }
  ) => string;
  maskFinancial: (realValueText: string, forceShow?: boolean) => string;
}

const FinancialPrivacyContext = createContext<FinancialPrivacyContextType>({
  showFinancialValues: false,
  toggleFinancialVisibility: () => {},
  formatMoney: (amount, options) => {
    const symbol = options?.showCurrencySymbol !== false ? 'R$ ' : '';
    if (options?.forceShow) {
      if (amount === null || amount === undefined || amount === '') return `${symbol}0,00`;
      const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(',', '.'));
      if (isNaN(num)) return `${symbol}0,00`;
      return `${symbol}${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${symbol}••••••`;
  },
  formatPercent: (percentage, options) => {
    if (options?.forceShow) {
      if (percentage === null || percentage === undefined || percentage === '') return '0%';
      const num = typeof percentage === 'number' ? percentage : parseFloat(String(percentage).replace(',', '.'));
      if (isNaN(num)) return '0%';
      return `${num.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    }
    return '••••••';
  },
  maskFinancial: (text, forceShow) => {
    if (forceShow) return text;
    return text.trim().startsWith('R$') ? 'R$ ••••••' : '••••••';
  },
});

export const FinancialPrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Always starts as false (hidden) on page access or refresh
  const [showFinancialValues, setShowFinancialValues] = useState<boolean>(false);

  const toggleFinancialVisibility = () => {
    setShowFinancialValues((prev) => !prev);
  };

  const formatMoney = (
    amount: number | string | null | undefined,
    options?: { showCurrencySymbol?: boolean; forceShow?: boolean }
  ): string => {
    const showSymbol = options?.showCurrencySymbol !== false;
    const prefix = showSymbol ? 'R$ ' : '';

    if (!showFinancialValues && !options?.forceShow) {
      return `${prefix}••••••`;
    }

    if (amount === null || amount === undefined || amount === '') {
      return `${prefix}0,00`;
    }

    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(',', '.'));
    if (isNaN(num)) {
      return `${prefix}0,00`;
    }

    const formatted = num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return `${prefix}${formatted}`;
  };

  const formatPercent = (
    percentage: number | string | null | undefined,
    options?: { forceShow?: boolean }
  ): string => {
    if (!showFinancialValues && !options?.forceShow) {
      return '••••••';
    }

    if (percentage === null || percentage === undefined || percentage === '') {
      return '0%';
    }

    const num = typeof percentage === 'number' ? percentage : parseFloat(String(percentage).replace(',', '.'));
    if (isNaN(num)) {
      return '0%';
    }

    return `${num.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  };

  const maskFinancial = (realValueText: string, forceShow?: boolean): string => {
    if (showFinancialValues || forceShow) {
      return realValueText;
    }
    if (realValueText.trim().startsWith('R$')) {
      return 'R$ ••••••';
    }
    return '••••••';
  };

  return (
    <FinancialPrivacyContext.Provider
      value={{
        showFinancialValues,
        toggleFinancialVisibility,
        formatMoney,
        formatPercent,
        maskFinancial,
      }}
    >
      {children}
    </FinancialPrivacyContext.Provider>
  );
};

export const useFinancialPrivacy = () => useContext(FinancialPrivacyContext);

export const FinancialPrivacyToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { showFinancialValues, toggleFinancialVisibility } = useFinancialPrivacy();

  return (
    <button
      type="button"
      onClick={toggleFinancialVisibility}
      title={showFinancialValues ? 'Ocultar informações financeiras' : 'Mostrar informações financeiras'}
      className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center border font-mono font-bold text-xs gap-1.5 shadow-sm active:scale-95 ${
        showFinancialValues
          ? 'bg-[#eab308] text-black border-[#eab308] hover:bg-white shadow-[#eab308]/20'
          : 'bg-black text-[#eab308] border-[#eab308]/40 hover:border-[#eab308] hover:bg-neutral-900'
      } ${className}`}
      aria-label={showFinancialValues ? 'Ocultar informações financeiras' : 'Mostrar informações financeiras'}
    >
      {showFinancialValues ? (
        <>
          <Eye size={16} className="stroke-[2.5]" />
          <span className="text-[11px]">👁️</span>
        </>
      ) : (
        <>
          <EyeOff size={16} className="stroke-[2.5]" />
          <span className="text-[11px]">🙈</span>
        </>
      )}
    </button>
  );
};
