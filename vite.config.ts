import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    root: 'src',
    base: './',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
    plugins: [
        vue(),
        viteStaticCopy({
            targets: [
                {
                    src: './assets/textures/**/*',
                    dest: './',
                },
                {
                    src: './assets/models/**/*',
                    dest: './',
                },
                {
                    src: './assets/sounds/**/*',
                    dest: './',
                },
            ],
        }),
    ],
});
