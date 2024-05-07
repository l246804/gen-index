import { cwd as getCwd } from 'node:process'
import { extname, posix, resolve } from 'node:path'
import { isString } from 'nice-fns'
import type { MaybeArray } from '@rhao/types-base'
import type { Options } from 'fast-glob'
import { globSync } from 'fast-glob'
import { createFilter, normalizePath } from '@rollup/pluginutils'
import fs from 'fs-extra'

export interface CommonConfig {
  /**
   * 当前工作空间目录
   * @default process.cwd()
   */
  cwd?: string
  /**
   * 输出文件，扩展名默认从匹配的文件列表中检测，若无则默认为 `.ts`
   * @default index.*
   */
  outFile?: string
  /**
   * 包含的文件，支持 `*` 匹配
   */
  include?: MaybeArray<string | RegExp>
  /**
   * 排除的文件，支持 `*` 匹配
   */
  exclude?: MaybeArray<string | RegExp>
  /**
   * 仅匹配目录
   */
  onlyDirectories?: boolean
  /**
   * 仅匹配文件
   */
  onlyFiles?: boolean
  /**
   * 匹配文件是否保留扩展名
   * @default false
   */
  preserveExtName?: boolean
  /**
   * 是否允许写入空内容
   * @default true
   */
  allowEmpty?: boolean
  /**
   * Glob 配置项
   * @default
   * ```
   * {
   *   absolute: true,
   *   dot: true
   * }
   * ```
   */
  glob?: Options
  /**
   * 生成代码，默认生成 ESModule 的 `re-export` 代码
   */
  genCode?: (module: string) => string
}

export interface SingleConfig extends CommonConfig {
  /**
   * 入口目录
   */
  input: string
}

export interface MultipleConfig extends CommonConfig {
  /**
   * 入口目录配置列表
   */
  dirs: (SingleConfig | string)[]
}

export type GIConfig = MultipleConfig | SingleConfig[]

/**
 * 生成目录入口文件
 * @param config 配置项
 */
export function genIndex(config: GIConfig) {
  if (!Array.isArray(config)) {
    config = config.dirs.map((cfg) => {
      return {
        ...config,
        ...(isString(cfg) ? { input: cfg } : cfg),
      }
    })
  }

  config.forEach(
    ({
      cwd = getCwd(),
      input,
      outFile,
      glob = {},
      onlyFiles,
      onlyDirectories,
      preserveExtName = false,
      allowEmpty = true,
      include,
      exclude,
      genCode = defaultGenCode,
    }) => {
      cwd = normalizePath(resolve(cwd, input))
      fs.ensureDirSync(cwd)

      let paths = globSync('**/*', {
        cwd,
        absolute: true,
        onlyFiles,
        onlyDirectories,
        dot: true,
        ...glob,
      }).map(normalizePath)

      if (!outFile)
        outFile = `index${extname(paths[0] || '')}`
      outFile = normalizePath(resolve(cwd, outFile))

      const extName = extname(outFile)

      const filter = createFilter(include, exclude, { resolve: cwd })
      paths = paths.filter((p) => filter(p) && !p.endsWith(outFile))

      if (!preserveExtName)
        paths = paths.map((p) => p.replace(extName, ''))

      if (!allowEmpty && paths.length === 0)
        return

      const codes = paths.map((path) => genCode(posix.relative(cwd, path)))
      fs.writeFileSync(outFile, `${codes.join('\n')}`, { encoding: 'utf-8' })
    },
  )
}

function defaultGenCode(module: string) {
  return `export * from './${module}'`
}
