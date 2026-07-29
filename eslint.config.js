// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Luật phụ thuộc giữa các package (§3 của docs/PLAN-P1.md).
 *
 * Kiến trúc của dự án này nằm ở chỗ *cái gì không được import cái gì*: renderer
 * không biết DOM nên chạy được headless (REN-01/04), schema không biết engine nào
 * nên engine lazy-load được (D-10), LLM chỉ sống trong tools/pipeline nên không
 * đường nào chạm tới người học (§14). Ba ràng buộc đó không tự giữ được bằng
 * thiện chí — chúng phải làm CI đỏ.
 */

const LLM_PACKAGES = ['@anthropic-ai/*', 'openai', 'openai/*'];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.pnpm-store/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // --- Tầng lá: schema và theme không phụ thuộc gì trong repo -----------------
  {
    files: ['packages/schema/src/**/*.ts', 'packages/theme/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@combviz/*'],
              message:
                'schema và theme là tầng lá: chúng là hợp đồng, không được biết về ai. ' +
                'Cần dữ liệu từ engine thì nhận qua tham số (EngineSchemaFragment), không import.',
            },
          ],
        },
      ],
    },
  },

  // --- Renderer phải chạy được ngoài browser ---------------------------------
  {
    files: ['packages/render/src/**/*.ts'],
    languageOptions: {
      globals: {},
    },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'render là hàm thuần; DOM nằm ở lớp patch (D-03)' },
        { name: 'document', message: 'render là hàm thuần; DOM nằm ở lớp patch (D-03)' },
        { name: 'navigator', message: 'render là hàm thuần (D-03)' },
        { name: 'performance', message: 'render phải deterministic để video khớp player (D-05)' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@combviz/engine-*'],
              message:
                'render không biết engine cụ thể; engine tự đăng ký renderer fragment qua registry.',
            },
          ],
        },
      ],
    },
  },

  // --- DSL: nội dung problem là dữ liệu, không phải code (NFR-S1) -------------
  {
    files: ['packages/dsl/src/**/*.ts'],
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'DSL chạy sandboxed: không network (DSL-02)' },
        { name: 'document', message: 'DSL chạy sandboxed: không DOM (DSL-02)' },
      ],
    },
  },

  // --- LLM chỉ sống trong tools/pipeline (§14) --------------------------------
  {
    files: ['packages/**/*.ts', 'apps/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: LLM_PACKAGES,
              message:
                'LLM chỉ sống trong tools/pipeline — build tooling của chính chủ, ' +
                'không bao giờ chạm runtime người học (§14, NG-03).',
            },
          ],
        },
      ],
    },
  },

  // --- Apps không import chéo nhau --------------------------------------------
  {
    files: ['apps/*/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@combviz/app-*'],
              message: 'Player và Studio dùng chung packages/*, không import lẫn nhau.',
            },
            {
              group: LLM_PACKAGES,
              message: 'LLM không bao giờ chạm runtime người học (§14, NG-03).',
            },
          ],
        },
      ],
    },
  },
);
