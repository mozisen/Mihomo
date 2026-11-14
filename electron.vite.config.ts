import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Win7 build: bundle all deps (Vite converts ESM→CJS), only externalize native modules
const isLegacyBuild = process.env.LEGACY_BUILD === 'true'
const legacyExternal = ['sysproxy-rs', 'electron', 'utf-8-validate', 'bufferutil']

export default defineConfig({
  main: {
    define: { __LEGACY_BUILD__: JSON.stringify(isLegacyBuild) },
    plugins: isLegacyBuild ? [] : [externalizeDepsPlugin()],
    build: isLegacyBuild
      ? { rollupOptions: { external: legacyExternal, output: { format: 'cjs' } } }
      : undefined
  },
  preload: {
    plugins: isLegacyBuild ? [] : [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: isLegacyBuild ? legacyExternal : undefined,
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    define: { __LEGACY_BUILD__: JSON.stringify(isLegacyBuild) },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          floating: resolve('src/renderer/floating.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
