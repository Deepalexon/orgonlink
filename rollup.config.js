import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import terser from '@rollup/plugin-terser';

const minify = terser({
  compress: { drop_console: false, passes: 1 },
  mangle: true,
  format: { comments: false },
});

const onwarn = (warning, warn) => {
  if (['CIRCULAR_DEPENDENCY','THIS_IS_UNDEFINED','EVAL','SOURCEMAP_ERROR'].includes(warning.code)) return;
  warn(warning);
};

// Лёгкие плагины для SW — только @noble/* и @scure/*
// НЕ включаем orgonweb (Google Closure Protobuf несовместим с SW)
const lightPlugins = [
  json(),
  nodePolyfills(),
  nodeResolve({
    browser: true,
    preferBuiltins: false,
    exportConditions: ['browser', 'module', 'default'],
  }),
  commonjs({
    transformMixedEsModules: true,
    requireReturnsDefault: 'auto',
  }),
  minify,
];

export default [

  // ── 1. Background Service Worker ─────────────────────────────────────
  // Только чистая крипта (@noble, @scure, bs58check) — без orgonweb
  {
    input: 'src/background/service_worker.js',
    output: {
      file: 'dist/background/service_worker.js',
      format: 'iife',
      name: 'OrgonLinkSW',
      sourcemap: false,
      inlineDynamicImports: true,
    },
    plugins: lightPlugins,
    // Явно исключаем orgonweb — он несовместим с Chrome SW
    external: [],
    onwarn,
  },

  // ── 2. Content Script Bridge (ISOLATED world) ─────────────────────────
  {
    input: 'src/content/bridge.js',
    output: {
      file: 'dist/content/bridge.js',
      format: 'iife',
      name: 'OrgonLinkBridge',
      sourcemap: false,
    },
    plugins: [json(), nodeResolve({ browser: true }), commonjs(), minify],
    onwarn,
  },

  // ── 3. Provider (MAIN world) ──────────────────────────────────────────
  {
    input: 'src/provider/orgonWeb.js',
    output: {
      file: 'dist/provider/orgonWeb.js',
      format: 'iife',
      name: 'OrgonLinkProvider',
      sourcemap: false,
    },
    plugins: [json(), nodeResolve({ browser: true }), commonjs(), minify],
    onwarn,
  },

];
// Это добавление в конец — не рабочий код, используем отдельный скрипт
