const RULES=Object.freeze([
  {id:'ABOUT_BINARY',pattern:/\bn[aã]o\s+é(?=\s)\s+sobre\b[\s\S]{1,220}?[,:;.!?]\s*(?:mas\s+)?é(?=\s)\s+sobre\b/iu},
  {id:'MISSING_BINARY',pattern:/\bn[aã]o\s+falta\b[\s\S]{1,220}?[,:;.!?]\s*falta\b/iu},
  {id:'TREATMENT_BINARY',pattern:/\bn[aã]o\s+se\s+trata\s+(?:de|do|da)\b[\s\S]{1,220}?[,:;]\s*(?:e\s+sim|mas\s+sim)\b/iu},
  {id:'PROBLEM_BINARY',pattern:/\bo\s+problema\s+n[aã]o\s+é(?=\s)[\s\S]{1,220}?[,:;.!?]\s*é(?=\s|$)/iu},
  {id:'GENERIC_BINARY',pattern:/\bn[aã]o\s+é(?=\s)[^.!?\n]{1,220}?[,:;]\s*(?:mas\s+)?é(?=\s|$)/iu},
]);

export const STYLE_POLICY=Object.freeze({
  id:'STYLE_DIRECT_AFFIRMATIVE_V1',
  version:1,
  bannedContrastiveReframe:true,
  mode:'FAIL_CLOSED',
  surfaces:Object.freeze(['chat','ui','artifact','report','paper','letter','slide','infographic','automation','agent']),
  instruction:'Use frases afirmativas diretas. Elimine reformulações binárias contrastivas usadas para impacto retórico. Expresse a conclusão principal diretamente. Ao detectar esse padrão em um rascunho, reescreva a passagem antes de publicar.',
});

function text(value){return String(value??'')}

export function buildStyleInstruction(){
  return STYLE_POLICY.instruction;
}

export function detectStyleViolations(value){
  const source=text(value);
  const violations=[];
  for(const rule of RULES){
    const match=rule.pattern.exec(source);
    if(!match)continue;
    violations.push({
      code:'CONTRASTIVE_REFRAME',
      severity:'ERROR',
      rule:rule.id,
      index:match.index,
      excerpt:match[0].slice(0,260),
      policyId:STYLE_POLICY.id,
    });
  }
  return violations.sort((a,b)=>a.index-b.index||a.rule.localeCompare(b.rule));
}

export function validateStyleText(value){
  const violations=detectStyleViolations(value);
  return {ok:violations.length===0,violations};
}

export async function enforceStyleText(value,{rewrite,maxAttempts=2}={}){
  let candidate=text(value);
  for(let attempt=0;attempt<=maxAttempts;attempt+=1){
    const result=validateStyleText(candidate);
    if(result.ok)return {text:candidate,rewritten:attempt>0,attempts:attempt,validation:result};
    if(typeof rewrite!=='function'||attempt===maxAttempts){
      const error=new Error(`STYLE_POLICY_VIOLATION:${result.violations.map(item=>item.rule).join(',')}`);
      error.code='STYLE_POLICY_VIOLATION';
      error.policyId=STYLE_POLICY.id;
      error.violations=result.violations;
      throw error;
    }
    candidate=text(await rewrite({text:candidate,violations:result.violations,instruction:buildStyleInstruction(),policy:STYLE_POLICY}));
  }
  throw new Error('STYLE_POLICY_ENFORCEMENT_EXHAUSTED');
}
