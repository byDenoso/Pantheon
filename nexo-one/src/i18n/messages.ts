import type {Locale} from '../atlas/api.ts';
import type {Notice} from '../atlas/privateSession.ts';

export type Messages = {
  brand: string; tagline: string;
  heroTitle: string; heroLead: string;
  techOpen: string; techClose: string; techTitle: string; techBody: string[];
  emptyTitle: string; emptyBody: string; loading: string; unavailable: string;
  kinds: Record<'method' | 'hypothesis' | 'limit' | 'robustness' | 'note', string>;
  plainLabel: string; technicalLabel: string; creditLabel: string;
  vizLabel: string; vizNote: string;
  themeLabel: string; themeLight: string; themeDark: string; themeSystem: string;
  langLabel: string; langAuto: string;
  privateLink: string; backPublic: string; navLabel: string;
  privateTitle: string; privateLead: string; pinLabel: string; pinHint: string;
  signIn: string; signingIn: string; signOut: string; checking: string;
  notices: Record<Notice, string>; rateLimited: (s: number) => string;
  revPending: string; revRevoked: string; revUnconfirmed: string; revRetry: string;
  expires: string; dataTitle: string; noData: string; more: string;
  frameTitle: string; frameUnavailable: string; frameRetry: string;
};

export const MESSAGES: Record<Locale, Messages> = {
  'pt-BR': {
    brand: 'NEXO', tagline: 'Laboratório de Cosmologia Computacional',
    heroTitle: 'NEXO — Laboratório de Cosmologia Computacional',
    heroLead: 'O NEXO estuda a expansão do Universo e a formação de suas estruturas, comparando modelos cosmológicos com dados de observações.',
    techOpen: 'Ver detalhe técnico', techClose: 'Ocultar detalhe técnico', techTitle: 'Detalhe técnico',
    techBody: [
      'Cada item publicado traz o método usado, as hipóteses assumidas, os limites conhecidos e os testes de robustez aplicados.',
      'A ilustração do topo é gerada por computador a partir de uma semente fixa. Ela não contém dados observacionais.',
    ],
    emptyTitle: 'Não há trabalhos públicos disponíveis nesta página por enquanto.',
    emptyBody: 'Os trabalhos aparecerão aqui quando houver conteúdo aprovado para publicação.',
    loading: 'Carregando…', unavailable: 'Não foi possível carregar os trabalhos. Tente novamente em instantes.',
    kinds: {method: 'Método', hypothesis: 'Hipótese', limit: 'Limite', robustness: 'Teste de robustez', note: 'Nota'},
    plainLabel: 'Em linguagem simples', technicalLabel: 'Detalhe técnico', creditLabel: 'Crédito',
    vizLabel: 'Ilustração decorativa de uma teia cósmica gerada por computador',
    vizNote: 'Representação artística da teia. Sem dados observacionais.',
    themeLabel: 'Tema', themeLight: 'Claro', themeDark: 'Escuro', themeSystem: 'Sistema',
    langLabel: 'Idioma', langAuto: 'Automático',
    privateLink: 'Área privada', backPublic: 'Voltar à página pública', navLabel: 'Navegação principal',
    privateTitle: 'Área privada', privateLead: 'O acesso é validado no servidor. Esta página não guarda a senha nem o conteúdo privado.',
    pinLabel: 'Código de acesso', pinHint: 'Entre 8 e 128 caracteres.',
    signIn: 'Entrar', signingIn: 'Entrando…', signOut: 'Sair', checking: 'Verificando a sessão…',
    notices: {
      invalid: 'Código de acesso recusado.',
      not_configured: 'O acesso privado ainda não foi configurado no servidor.',
      unavailable: 'O servidor privado está indisponível. Tente novamente em instantes.',
      rate_limited: 'Muitas tentativas.',
      not_deployed: 'A área privada não existe neste ambiente de hospedagem.',
      contract: 'O servidor respondeu em um formato inesperado. Nenhum dado foi exibido.',
    },
    rateLimited: s => `Muitas tentativas. Aguarde cerca de ${Math.max(1, Math.round(s / 60))} min.`,
    revPending: 'Encerrando a sessão no servidor…',
    revRevoked: 'Sessão encerrada. O servidor confirmou a revogação.',
    revUnconfirmed: 'Os dados privados foram removidos desta tela, mas o servidor não confirmou o encerramento da sessão. Ela pode continuar válida por até 1 hora.',
    revRetry: 'Tentar encerrar de novo',
    expires: 'Sessão válida até', dataTitle: 'Dados privados', noData: 'Sem dados.', more: 'itens omitidos',
    frameTitle: 'Atlas privado', frameUnavailable: 'A visão privada não abriu. Nenhum dado foi exibido.', frameRetry: 'Tentar de novo',
  },
  en: {
    brand: 'NEXO', tagline: 'Computational Cosmology Lab',
    heroTitle: 'NEXO — Computational Cosmology Laboratory',
    heroLead: 'NEXO studies the expansion of the Universe and the formation of its structures by comparing cosmological models with observational data.',
    techOpen: 'Show technical detail', techClose: 'Hide technical detail', techTitle: 'Technical detail',
    techBody: [
      'Every published item lists the method used, the assumptions made, the known limits and the robustness tests applied.',
      'The illustration at the top is computer-generated from a fixed seed. It contains no observational data.',
    ],
    emptyTitle: 'No public research materials are available on this page yet.',
    emptyBody: 'Work will appear here when content has been approved for publication.',
    loading: 'Loading…', unavailable: 'The work could not be loaded. Please try again shortly.',
    kinds: {method: 'Method', hypothesis: 'Hypothesis', limit: 'Limit', robustness: 'Robustness test', note: 'Note'},
    plainLabel: 'In plain language', technicalLabel: 'Technical detail', creditLabel: 'Credit',
    vizLabel: 'Decorative computer-generated illustration of a cosmic web',
    vizNote: 'Artistic representation of the cosmic web. No observational data shown.',
    themeLabel: 'Theme', themeLight: 'Light', themeDark: 'Dark', themeSystem: 'System',
    langLabel: 'Language', langAuto: 'Automatic',
    privateLink: 'Private area', backPublic: 'Back to the public page', navLabel: 'Main navigation',
    privateTitle: 'Private area', privateLead: 'Access is validated on the server. This page stores neither the passcode nor the private content.',
    pinLabel: 'Access code', pinHint: 'Between 8 and 128 characters.',
    signIn: 'Sign in', signingIn: 'Signing in…', signOut: 'Sign out', checking: 'Checking the session…',
    notices: {
      invalid: 'Access code rejected.',
      not_configured: 'Private access has not been configured on the server yet.',
      unavailable: 'The private server is unavailable. Try again shortly.',
      rate_limited: 'Too many attempts.',
      not_deployed: 'The private area does not exist on this hosting environment.',
      contract: 'The server answered in an unexpected format. No data was shown.',
    },
    rateLimited: s => `Too many attempts. Wait about ${Math.max(1, Math.round(s / 60))} min.`,
    revPending: 'Ending the session on the server…',
    revRevoked: 'Signed out. The server confirmed the revocation.',
    revUnconfirmed: 'Private data was removed from this screen, but the server did not confirm that the session ended. It may stay valid for up to 1 hour.',
    revRetry: 'Try to end it again',
    expires: 'Session valid until', dataTitle: 'Private data', noData: 'No data.', more: 'items omitted',
    frameTitle: 'Private Atlas', frameUnavailable: 'The private view did not open. No data was shown.', frameRetry: 'Try again',
  },
};
