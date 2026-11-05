import type {Locale} from '../api.ts';
import {pick} from '../publicItems.ts';
import {researchRecord,type Revision} from '../researchRegistry.ts';

/** Missing provenance stays missing; website dates and text hashes are not versions. */
export function ResultHistory({versions,locale}:{versions:Revision[];locale:Locale}) {
  const en=locale==='en',unknown=en?'Not available in the public record.':'Não informado no registro público.';
  const status={ongoing:en?'Ongoing':'Em andamento',published:en?'Published':'Publicado',retracted:en?'Retracted':'Retratado',unknown};
  return <ol className="nexo-record-history">{versions.map((version,i)=><li key={`${version.analysisId??''}:${version.version}`}>
    <h3>{en?'Source-declared version':'Versão declarada na fonte'} {version.version}</h3>
    <p>{en?'Scientific analysis':'Análise científica'}: <code>{version.analysisId??unknown}</code></p>
    {i>0&&version.changeReason&&<p>{en?'Reason for change':'Motivo da alteração'}: {pick(version.changeReason,locale)}</p>}
    <dl className="nexo-record-fields">
      <div><dt>{en?'Scientific status':'Estado científico'}</dt><dd>{status[version.status]}</dd></div>
      <div><dt>{en?'Date':'Data'}</dt><dd>{version.date??unknown}</dd></div>
      <div><dt>{en?'Datasets and DOI':'Dados e DOI'}</dt><dd>{version.datasets?version.datasets.map(d=>`${d.name}${d.doi?` · ${d.doi}`:''}`).join('; '):unknown}</dd></div>
      <div><dt>{en?'Code and Zenodo DOI':'Código e DOI Zenodo'}</dt><dd>{version.code?[version.code.commit,version.code.zenodoDoi].filter(Boolean).join(' · ')||unknown:unknown}</dd></div>
      <div><dt>{en?'Publication':'Publicação'}</dt><dd>{version.publication?.doi?<a href={`https://doi.org/${version.publication.doi}`}>{version.publication.doi}</a>:version.publication?.arxiv?<a href={`https://arxiv.org/abs/${version.publication.arxiv}`}>{version.publication.arxiv}</a>:unknown}</dd></div>
      <div><dt>{en?'Result':'Resultado'}</dt><dd>{version.result?pick(version.result,locale):unknown}</dd></div>
      <div><dt>{en?'Uncertainty':'Incerteza'}</dt><dd>{version.uncertainty?pick(version.uncertainty,locale):unknown}</dd></div>
      <div><dt>{en?'Evidence level':'Nível de evidência'}</dt><dd>{version.evidenceLevel??unknown}</dd></div>
      <div><dt>{en?'Scope and limitations':'Escopo e limites'}</dt><dd>{[version.scope,version.limits].filter(Boolean).map(v=>pick(v!,locale)).join(' ')||unknown}</dd></div>
    </dl>
    {version.provenance&&<details><summary>{en?'Field provenance':'Proveniência por campo'}</summary><ul>{Object.entries(version.provenance).map(([field,ref])=><li key={field}><strong>{field}</strong> · <a href={`https://github.com/byDenoso/Pantheon/blob/${ref.commit}/${ref.path}`}>{ref.path}</a> · {ref.pointer}<br/>SHA-256: <code>{ref.sha256}</code></li>)}</ul></details>}
  </li>)}</ol>;
}

export default function ResearchRecord({questionId,locale}:{questionId:string;locale:Locale}) {
  const en = locale === 'en', record = researchRecord(questionId);
  const unknown = en ? 'Not available in the public record.' : 'Não informado no registro público.';
  return <section className="nexo-record" aria-labelledby="nexo-record-title">
    <h2 id="nexo-record-title">{en ? 'Result record and provenance' : 'Registro de resultado e proveniência'}</h2>
    <p>{en ? 'This catalog groups public text. A text fingerprint does not establish the identity, version, or status of the underlying scientific analysis.' : 'Este catálogo agrupa textos públicos. A impressão digital do texto não identifica nem estabelece a versão ou o estado científico da análise de origem.'}</p>
    {!record?.versions.length ? <dl className="nexo-record-fields"><div><dt>{en?'Status and version':'Estado e versão'}</dt><dd>{unknown}</dd></div><div><dt>{en?'Data, code and uncertainty':'Dados, código e incerteza'}</dt><dd>{unknown}</dd></div><div><dt>{en?'Revision history':'Histórico de versões'}</dt><dd>{unknown}</dd></div></dl> : <ResultHistory versions={record.versions} locale={locale}/>}
    <p><a href="/claims/">{en?'Browse sourced statements':'Consultar alegações com fonte'}</a></p>
  </section>;
}
