import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-dom', 'lucide-react'],
  noExternal: ['modern-screenshot'],
  jsx: 'react-jsx',
  sourcemap: false,
  minify: false,
})
