import { resolve } from 'node:path'
import type { UserConfig } from 'vite'
import { defineConfig } from 'vite'
import Dts from 'vite-plugin-dts'
import type { ExternalOption, OutputOptions } from 'rollup'
import pkg from './package.json'

// 输出格式后缀
const esmExt = '.js'
const cjsExt = '.cjs'

// 输出目录
const outDir = resolve(__dirname, 'dist')

// 入口目录
const entryDir = resolve(__dirname, 'src')
const entryFile = 'src/index'

// 生成外部依赖配置
function genExternals() {
  const { peerDependencies = {}, dependencies = {} } = pkg as any
  return [
    /^node(:.+)?$/,
    ...new Set([...Object.keys(peerDependencies), ...Object.keys(dependencies)]),
  ].map((p) => p instanceof RegExp ? p : new RegExp(`^${p}$|^${p}/.+`)) as ExternalOption
}

// 生成模块输出配置
function genOutput(format: 'cjs' | 'esm') {
  return {
    // 输出的代码格式
    format,
    // 是否保留源码文件结构
    preserveModules: true,
    // 源码根目录
    preserveModulesRoot: entryDir,
    // 入口文件名
    entryFileNames: (info) =>
      `${/node_modules/.test(info.name) ? info.name.split('node_modules/').at(-1)! : '[name]'}${
        format === 'esm' ? esmExt : cjsExt
      }`,
  } as OutputOptions
}

export default defineConfig(() => {
  return {
    build: {
      outDir,
      lib: {
        entry: [entryFile, 'src/bin.ts'],
      },
      rollupOptions: {
        external: genExternals(),
        output: [genOutput('esm'), genOutput('cjs')],
      },
    },
    define: {
      __VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': entryDir,
      },
    },
    plugins: [
      Dts({ include: [entryDir, 'types'] }),
    ],
  } as UserConfig
})