import React, { useState } from 'react';

interface ManualChoiceWithOtherProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function ManualChoiceWithOther({ label, value, onChange, options, placeholder = 'Selecione uma opção', required = false, className = '' }: ManualChoiceWithOtherProps) {
  const [manual, setManual] = useState(false);
  const isOther = manual || Boolean(value && !options.includes(value));

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[9px] font-black uppercase text-gray-500">{label}{required ? ' *' : ''}</label>
      <select
        aria-label={label}
        value={isOther ? '__other__' : value}
        onChange={(event) => {
          const choice = event.target.value;
          setManual(choice === '__other__');
          onChange(choice === '__other__' ? '' : choice);
        }}
        className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold text-black"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
        <option value="__other__">Outro — digitar manualmente</option>
      </select>
      {isOther && <input
        aria-label={`${label}: outro valor`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Digite ${label.toLowerCase()}`}
        className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black"
      />}
    </div>
  );
}
