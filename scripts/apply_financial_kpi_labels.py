from pathlib import Path

path = Path('src/components/AdminFinancial.tsx')
text = path.read_text(encoding='utf-8')
replacements = {
    'Faturamento Total': 'Receita Líquida Recebida',
    'Lucro Líquido Real': 'Resultado Operacional',
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Target label not found: {old}')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Financial KPI labels aligned with canonical metrics')
