const { defineConfig } = require('vite');
const { viteStaticCopy } = require('vite-plugin-static-copy');

module.exports = defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'assets/textures/**/*',
          dest: 'assets/textures',
        },
      ],
    }),
  ],
});
