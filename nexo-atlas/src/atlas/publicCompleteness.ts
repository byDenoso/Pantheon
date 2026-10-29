const FIELDS = ['question','answers','method','result'] as const;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
// Editorial absence placeholders are not public research summaries. A concrete
// negative or inconclusive result remains valid and must not be rewritten.
const MISSING = /^(?:(?:o\s+)?(?:metodo|resultado(?:\s+cientifico)?|pergunta|resposta)(?:\s+detalhado)?\s+(?:indisponivel|(?:ainda\s+)?nao\s+(?:esta|foi|e|ha))|nao\s+ha\s+resultado\s+disponivel|o\s+alcance\s+da\s+resposta\s+ainda\s+nao\s+esta\s+descrito|(?:the\s+)?(?:method|(?:scientific\s+)?result|question|answer)(?:\s+description)?\s+(?:unavailable|is\s+(?:not\s+available|unavailable|missing))|no\s+(?:scientific\s+)?result\s+(?:is\s+)?available|(?:tbd|n\/?a|not\s+available|not\s+provided|nao\s+informado|a\s+definir|pendente)[.!\s]*$)/i;
export function isCompletePublicTest(row: unknown): boolean {
  if (!row || typeof row!=='object' || Array.isArray(row)) return false;
  return FIELDS.every(field => {
    const value=(row as Record<string,unknown>)[field];
    if (!value || typeof value!=='object' || Array.isArray(value)) return false;
    return ['pt-BR','en'].every(locale => {
      const text=(value as Record<string,unknown>)[locale];
      return typeof text==='string' && text.trim().length>0 && !MISSING.test(normalize(text));
    });
  });
}
