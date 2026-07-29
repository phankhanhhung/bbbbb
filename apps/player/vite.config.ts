import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    // NFR-P3: bundle Player ≤ 300KB gzip. Báo động sớm hơn ngưỡng để còn kịp xoay
    // sở, thay vì phát hiện lúc đã trượt.
    chunkSizeWarningLimit: 260,
  },
});
