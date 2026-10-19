import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath, URL} from 'node:url';

export default defineConfig({
    plugins: [vue()],
    build: {
        target: 'es2022',
        rollupOptions: {
            input: {
                portfolio: fileURLToPath(new URL('./index.html', import.meta.url)),
                trading: fileURLToPath(new URL('./trading/index.html', import.meta.url)),
            },
        },
    },
});
