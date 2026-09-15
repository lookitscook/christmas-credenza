import { defineConfig } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';
export default defineConfig({
  base: './',
  build: { target: 'es2022', minify: false, cssMinify: false },
  plugins: [{
    name: 'bundle-third-party-licenses',
    apply: 'build',
    async closeBundle() {
      await mkdir('dist/licenses', { recursive: true });
      for (const [source, name] of [
        ['vendor/THREE-LICENSE.txt', 'THREE-LICENSE.txt'],
        ['vendor/TAILWIND-LICENSE.txt', 'TAILWIND-LICENSE.txt'],
        ['vendor/cross-hatch/LICENSE.txt', 'CROSS-HATCH-LICENSE.txt'],
        ['vendor/cross-hatch/README.md', 'CROSS-HATCH-README.md'],
      ]) await copyFile(source, `dist/licenses/${name}`);
    },
  }],
});
