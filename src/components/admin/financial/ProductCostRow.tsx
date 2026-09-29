import { useEffect, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';

// Sub-component wrapper for elegant product metrics configuration
interface ProductRowProps {
  key?: any;
  prod: any;
  onUpdate: (id: string, costVal: number, priceVal: number) => Promise<void>;
  onDelete: (prod: any) => void;
}

export function ProductRow({ prod, onUpdate, onDelete }: ProductRowProps) {
  const { formatMoney, formatPercent, showFinancialValues } = useFinancialPrivacy();
  const [costInput, setCostInput] = useState<string>('');
  const [priceInput, setPriceInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const hasAutomaticCost = prod.costCalculation?.mode === 'automatic';

  useEffect(() => {
    setCostInput(String(prod.cost || prod.costPrice || 0));
    setPriceInput(String(prod.price || 0));
  }, [prod]);

  const unitProfitVal = (parseFloat(priceInput) || 0) - (parseFloat(costInput) || 0);
  const marginUnitPercentActual = (parseFloat(priceInput) || 0) > 0 ? (unitProfitVal / (parseFloat(priceInput) || 0)) * 100 : 0;

  const handleLocalSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(prod.id, parseFloat(costInput) || 0, parseFloat(priceInput) || 0);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <tr className="block lg:table-row border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors uppercase p-4 lg:p-0 space-y-2.5 lg:space-y-0">
      <td className="block lg:table-cell p-0 lg:p-4">
        <div className="font-extrabold text-black text-xs">{prod.name}</div>
        <div className="text-[8.5px] text-gray-400 font-black tracking-widest mt-0.5">SKU: {prod.slug}</div>
      </td>
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell">
         <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Estoque Atual</span>
         <span className="font-bold text-gray-650">{prod.stock || 0}</span>
      </td>
      
      {/* Dynamic Price Venda Input */}
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell">
         <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Preço de Venda</span>
         <div className="flex items-center gap-1 max-w-[110px] bg-gray-50/50 p-1.5 border border-black/5">
            <span className="text-[9px] font-black text-black/30">R$</span>
            <input 
              type="number" 
              step="0.01" min="0" aria-label={`Preço de venda de ${prod.name}`} 
              value={showFinancialValues ? priceInput : ''}
              disabled={!showFinancialValues}
              placeholder={showFinancialValues ? '0,00' : '••••••'}
              onChange={e => setPriceInput(e.target.value)}
              onFocus={e => {
                if (priceInput === '0' || priceInput === '0.00' || priceInput === '0.0') {
                  setPriceInput('');
                }
              }}
              onBlur={e => {
                const parsed = parseFloat(priceInput);
                if (isNaN(parsed) || priceInput.trim() === '') {
                  setPriceInput('0');
                }
              }}
              className="w-full bg-transparent font-black text-black focus:outline-none placeholder-gray-300" 
            />
         </div>
      </td>

      {/* Dynamic Cost Input */}
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell">
         <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Custo Fabricação</span>
         <div className="flex items-center gap-1 max-w-[110px] bg-gray-50/50 p-1.5 border border-black/5">
            <span className="text-[9px] font-black text-black/30">R$</span>
            <input 
              type="number" 
              step="0.01" min="0" aria-label={`Custo de fabricação de ${prod.name}`} 
              readOnly={hasAutomaticCost}
              value={showFinancialValues ? costInput : ''}
              disabled={!showFinancialValues}
              placeholder={showFinancialValues ? '0,00' : '••••••'}
              onChange={e => {
                if (!hasAutomaticCost) setCostInput(e.target.value);
              }}
              onFocus={e => {
                if (costInput === '0' || costInput === '0.00' || costInput === '0.0') {
                  setCostInput('');
                }
              }}
              onBlur={e => {
                const parsed = parseFloat(costInput);
                if (isNaN(parsed) || costInput.trim() === '') {
                  setCostInput('0');
                }
              }}
              className={`w-full bg-transparent font-bold focus:outline-none placeholder-gray-300 ${hasAutomaticCost ? 'text-emerald-700 cursor-not-allowed' : 'text-gray-650'}`}
            />
         </div>
         {hasAutomaticCost && (
           <span className="ml-2 text-[7px] font-black text-emerald-700 uppercase tracking-wider">Planilha</span>
         )}
      </td>

      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell font-black text-black italic">
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Lucro Unitário</span>
        <span>{formatMoney(unitProfitVal)}</span>
      </td>
      <td className={cn("block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell font-black italic", marginUnitPercentActual > 50 ? "text-emerald-600" : marginUnitPercentActual > 30 ? "text-amber-500" : "text-rose-600")}>
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Margem de Lucro</span>
        <span>{formatPercent(marginUnitPercentActual)}</span>
      </td>
      
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-center font-bold text-gray-750">
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Vendido</span>
        <span>{prod.soldCount || 0} u</span>
      </td>
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-center font-black">
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Faturamento Total</span>
        <span>{formatMoney(Number(prod.totalFaturamento || 0))}</span>
      </td>
      
      <td className="block lg:table-cell p-0 lg:p-4 flex justify-between items-center lg:table-cell text-right">
        <span className="inline-block lg:hidden font-extrabold text-gray-400 text-[8px] uppercase tracking-widest mr-2">Ações</span>
        <div className="flex items-center justify-end gap-2">
           <button 
             onClick={handleLocalSave}
             disabled={isSaving || !showFinancialValues}
             className="bg-black text-[9px] font-black text-white hover:bg-[#eab308] hover:text-black px-4 py-2 uppercase tracking-wider transition-all"
           >
             {isSaving ? '...' : 'Atualizar'}
           </button>

           <button
             type="button"
             onClick={() => onDelete(prod)}
             className="border border-red-200 hover:border-red-500 text-red-650 hover:bg-rose-50 text-[9px] font-black px-3 py-2 uppercase tracking-wider transition-all cursor-pointer"
           >
             Excluir
           </button>
        </div>
      </td>
    </tr>
  );
}

