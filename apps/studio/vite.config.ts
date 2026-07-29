import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Studio chạy **local**, không deploy (A-2).
 *
 * Nó cần File System Access API để đọc/ghi thẳng vào repo, mà API đó chỉ có trên
 * Chrome/Edge desktop. Deploy công khai một công cụ chỉ chạy trên một browser và
 * chỉ dành cho một người là mời rắc rối mà không đổi lấy gì.
 */
export default defineConfig({
  plugins: [preact()],
  build: { target: 'es2022' },
});
