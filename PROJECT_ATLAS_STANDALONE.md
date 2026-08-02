# Project Atlas Standalone

Build isolada do Project Atlas como aplicativo desktop portátil para Windows x64.

## Artefato

O workflow `Build Project Atlas Standalone` reconstrói o código a partir de `bootstrap/source.tar.gz`, valida o SHA-256, executa a suíte de testes e publica:

- `Project-Atlas-Standalone-3.1.0-win-x64.exe`
- `SHA256SUMS.txt`

## Características

- janela desktop própria;
- sem Vercel, CDN ou servidor externo;
- dados locais e snapshots ao lado do executável quando possível;
- seleção nativa da pasta sincronizada do Google Drive;
- watcher recursivo e reconciliação periódica;
- diff, provenance, arquivos não classificados e rollback local;
- contexto isolado e IPC restrito.

Fonte do pacote: `fc69ecf1b7045240c2367f753b3a2f0bd43a380cd8ecdb1d5485c4c325995cfa`.
