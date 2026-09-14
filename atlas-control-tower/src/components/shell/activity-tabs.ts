export type ActivityTab = 'changes' | 'next' | 'tests' | 'filaments';

export const ACTIVITY_TABS: Array<{ id: ActivityTab; label: string }> = [
  { id: 'changes', label: 'Mudanças' },
  { id: 'next', label: 'Próximas ações' },
  { id: 'tests', label: 'Testes' },
  { id: 'filaments', label: 'Filamentos' }
];

// Reasons shown for tabs with no backing reader in the current public/static
// pipeline. Kept out of ActivityDrawer.tsx so the exact copy is testable without a
// DOM/JSX runtime.
export const UNAVAILABLE_REASONS: { changes: string; next: string } = {
  changes: 'Nenhum reader público expõe um log de mudanças hoje. Ver Cockpit/Atividade autenticados.',
  next: 'Trabalho ativo requer a fachada privada (não conectada nesta build).'
};
