declare module '*.css';
declare module '*.svg?raw' { const conteudo: string; export default conteudo; }

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
