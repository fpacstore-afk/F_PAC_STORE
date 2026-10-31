import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {assertSafeClientEnvironment} from './scripts/clientCredentialSafety';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  assertSafeClientEnvironment(env);
  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        react: path.resolve(__dirname, './node_modules/react'),
        'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      },
    },
    server: {
      hmr: false,
      watch: null,
      strictPort: true,
      host: '0.0.0.0',
    },
  };
});
