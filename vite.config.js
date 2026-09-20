import { defineConfig } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';
export default defineConfig({
  // Pages supplies /repository/ (or / for a custom domain). Local builds stay portable.
  base: process.env.BASE_PATH || './',
  build: { target: 'es2022', minify: false, cssMinify: false,
    rolldownOptions: { input: { scene: 'index.html', logo: 'logo/index.html', pad: 'pad/index.html', home: 'home/index.html' } },
  },
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
        ['vendor/crt/LICENSE.txt', 'CRT-LICENSE.txt'],
        ['vendor/crt/README.md', 'CRT-README.md'],
        ['vendor/fonts/LITERATA-OFL.txt', 'LITERATA-OFL.txt'],
        ['vendor/fonts/INTER-OFL.txt', 'INTER-OFL.txt'],
        ['vendor/fonts/README.md', 'LOGO-FONTS-README.md'],
      ]) await copyFile(source, `dist/licenses/${name}`);
    },
  }],
});
