import type {Locale} from '../api.ts';
import './public-research-resources.css';

/** Public links and explicitly scoped outcomes only; no private Tower data. */
export function ResearchResources({locale}: {locale: Locale}) {
  const en = locale === 'en';
  return <section className="nexo-resources" aria-labelledby="nexo-resources-title">
    <h2 id="nexo-resources-title">{en ? 'Code and data' : 'Código e dados'}</h2>
    <p>{en ? 'Explore the public sources and reproducibility packages used in this work.' : 'Consulte fontes públicas e pacotes de reprodutibilidade usados na pesquisa.'}</p>
    <ul className="nexo-resources-list">
      <li><a href="https://github.com/byDenoso/AAS77733-Reproducibility">{en ? 'Pantheon+ reproducibility package' : 'Pacote de reprodutibilidade Pantheon+'}</a><span>{en ? 'Tests, methods and provenance for the AAS77733 analysis.' : 'Testes, métodos e proveniência da análise AAS77733.'}</span></li>
      <li><a href="https://github.com/byDenoso/AAS77733-Reproducibility/blob/4b2cde38852bbcd3df147ebb65317e9fd4335746/science/aas77733/manifest.json">{en ? 'Pantheon+ input manifest' : 'Manifesto dos dados Pantheon+'}</a><span>{en ? 'Pinned input versions and Git blob hashes for AAS77733.' : 'Versões fixadas e hashes Git dos dados de entrada de AAS77733.'}</span></li>
      <li><a href="https://github.com/byDenoso/camb-native-windows-reproducibility">{en ? 'CAMB on Windows' : 'CAMB no Windows'}</a><span>{en ? 'Code and numerical reproducibility material.' : 'Código e material de reprodutibilidade numérica.'}</span></li>
      <li><a href="https://zenodo.org/records/23969287">{en ? 'Generalized Chaplygin gas reproducibility package' : 'Pacote reprodutível do gás de Chaplygin generalizado'}</a><span>{en ? 'Versioned archive with code, input snapshots and reference outputs.' : 'Arquivo versionado com código, cópias dos dados de entrada e saídas de referência.'} <code>10.5281/zenodo.23969287</code></span></li>
      <li><a href="https://zenodo.org/records/18306484">{en ? 'JADES DR5 catalog' : 'Catálogo JADES DR5'}</a><span>{en ? 'Public catalog by Hainline and collaborators. The record lists file checksums.' : 'Catálogo público de Hainline e colaboradores. O registro lista os hashes dos arquivos.'} <code>10.5281/zenodo.18306484</code></span></li>
    </ul>
    <p className="nexo-resources-note">{en ? 'Individual result records show the input versions and hashes when the source provides them.' : 'A ficha de cada resultado mostra as versões e os hashes de entrada quando a fonte os informa.'}</p>
  </section>;
}

export function NullResults({locale}: {locale: Locale}) {
  const en = locale === 'en';
  return <section className="nexo-resources nexo-null-results" aria-labelledby="nexo-null-title">
    <h2 id="nexo-null-title">{en ? 'Results without a detection' : 'Resultados sem detecção'}</h2>
    <article>
      <h3>{en ? 'Pantheon+: residual feature' : 'Pantheon+: sinal nos resíduos'}</h3>
      <p>{en ? 'The reproducibility package reports no robust localized feature under the tested statistic and null models.' : 'O pacote de reprodutibilidade relata que não encontrou um sinal localizado robusto sob a estatística e os modelos nulos testados.'}</p>
      <p className="nexo-resources-limit"><strong>{en ? 'Limit:' : 'Limite:'}</strong> {en ? 'The result applies to the tested data and assumptions; it does not exclude every possible signal.' : 'O resultado vale para os dados e hipóteses examinados; não exclui todo sinal possível.'}</p>
      <a href="https://github.com/byDenoso/AAS77733-Reproducibility#scope">{en ? 'Read the analysis and its scope' : 'Ler a análise e seu escopo'}</a>
    </article>
  </section>;
}
