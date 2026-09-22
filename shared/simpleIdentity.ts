export type Collection = 'force' | 'mark' | 'prime';
type Scores = Record<Collection, number>;

export type Option = {
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

export const QUESTIONS: Question[] = [
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


export function calculateSimpleIdentity(answers: Record<number, string>) {
  const totals: Scores = { force: 0, mark: 0, prime: 0 };
  QUESTIONS.forEach((question, index) => {
    const option = question.options.find(item => item.id === answers[index + 1]);
    if (option) for (const key of Object.keys(totals)) totals[key] += option.scores[key];
  });
  const collection = Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0] as Collection;
  const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const exact = Object.entries(totals).map(([key, value]) => ({ key, value: value * 100 / total }));
  const scores = Object.fromEntries(exact.map(item => [item.key, Math.floor(item.value)])) as Scores;
  let left = 100 - Object.values(scores).reduce((a, b) => a + b, 0);
  for (const item of exact.sort((a, b) => (b.value % 1) - (a.value % 1))) if (left-- > 0) scores[item.key]++;
  return { collection, scores };
}
