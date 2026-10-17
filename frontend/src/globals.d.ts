declare module '*.css';
declare module '*.svg?raw' { const conteudo: string; export default conteudo; }
declare module '*.pdf?url' { const endereco: string; export default endereco; }

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
