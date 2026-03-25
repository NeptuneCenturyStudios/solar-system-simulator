import { defineConfig } from "vite";
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true
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
