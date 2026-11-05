import {useEffect,useState} from 'react';
import type {Locale} from '../api.ts';
import type {QuestionGroup} from '../publicQuestionGroups.ts';
import {pick} from '../publicItems.ts';
import {publicationKey} from '../publicSelection.ts';
import {claimRevisionState,researchRecord} from '../researchRegistry.ts';

// The original selected text remains readable as history. A later scientific
// revision must be visible before the reader treats it as a current result.
export default function StudyRevisionNotice({group,locale}:{group:QuestionGroup;locale:Locale}) {
  const en=locale==='en',versioned=Boolean(researchRecord(group.id)?.versions.length);
  const [checked,setChecked]=useState<{group:QuestionGroup;locale:Locale;warnings:{title:string;kind:string;version?:string}[];failed:boolean}|null>(null);
  useEffect(()=>{
    if(!versioned)return;
    const abort=new AbortController();
    Promise.all(group.members.map(async({test})=>{
      const key=await publicationKey(test),state=key?claimRevisionState(group.id,key):{kind:'ambiguous'};
      return state.kind==='superseded'||state.kind==='retracted'||state.kind==='ambiguous'?[{title:pick(test.question,locale),kind:state.kind,version:'revision' in state?state.revision?.version:undefined}]:[];
    })).then(rows=>{if(!abort.signal.aborted)setChecked({group,locale,warnings:rows.flat(),failed:false});})
      .catch(()=>{if(!abort.signal.aborted)setChecked({group,locale,warnings:[],failed:true});});
    return()=>abort.abort();
  },[group,locale,versioned]);
  if(!versioned)return null;
  if(checked?.group!==group||checked.locale!==locale)return <p role="status">{en?'Checking scientific revisions; the text below reflects the public selection.':'Conferindo revisões científicas; o texto abaixo reflete a seleção pública.'}</p>;
  if(checked.failed)return <p role="alert">{en?'Revision could not be checked. The text below must not be assumed current.':'Não foi possível conferir a revisão. Não assuma que o texto abaixo é a versão atual.'}</p>;
  if(!checked.warnings.length)return null;
  return <aside className="nexo-record" aria-label={en?'Scientific revision notice':'Aviso de revisão científica'}>
    <p><strong>{en?'This selection contains historical or unresolved text.':'Esta seleção contém texto histórico ou sem identidade resolvida.'}</strong> {en?'See the version history before using the result as a current statement.':'Consulte o histórico de versões antes de usar o resultado como uma alegação atual.'}</p>
    <ul>{checked.warnings.map((warning,i)=><li key={i}>{warning.title} · {warning.kind==='retracted'?(en?'Retracted':'Retratado'):warning.kind==='superseded'?(en?'Superseded':'Superado'):(en?'Ambiguous identity':'Identidade ambígua')}{warning.version?` · ${warning.version}`:''}</li>)}</ul>
  </aside>;
}
