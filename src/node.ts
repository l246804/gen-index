import { exit, cwd as getCwd } from 'node:process'
import { extname, posix, resolve } from 'node:path'
import { castError, isString } from 'nice-fns'
import type { MaybeArray, SetRequired } from '@rhao/types-base'
import type { Options } from 'fast-glob'
import { globSync } from 'fast-glob'
import { createFilter, normalizePath } from '@rollup/pluginutils'
import fs from 'fs-extra'
import type { Hookable, NestedHooks } from 'hookable'
import { createHooks } from 'hookable'

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
   * 生成代码方式，默认生成 ESModule 的 `re-export` 代码
   * @param module 模块相对路径
   */
  genCode?: (module: string) => string
  /**
   * 生成文件内容时是否在末尾插入新行
   * @default true
   */
  insertFinalNewline?: boolean
  /**
   * 单一任务执行出错时是否直接退出
   * @default true
   */
  exitWhenError?: boolean
  /**
   * 执行任务错误时触发
   * @param error 错误对象
   */
  onError?: (error: Error) => void
  /**
   * 事件配置
   */
  hooks?: NestedHooks<GIHooks>
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

export type ResolvedConfig = SetRequired<
  SingleConfig,
  | 'input'
  | 'outFile'
  | 'cwd'
  | 'glob'
  | 'preserveExtName'
  | 'allowEmpty'
  | 'genCode'
  | 'insertFinalNewline'
  | 'exitWhenError'
  | 'onError'
>

export interface GIContext {
  /**
   * 最终的配置项
   */
  config: ResolvedConfig
  /**
   * 检测到的路径列表
   */
  paths: string[]
  /**
   * 代码块列表
   */
  codes: string[]
  /**
   * 待写入文件的内容
   */
  content?: string
  /**
   * 识别到的文件扩展名
   */
  extName?: string
  /**
   * 事件管理器
   */
  hooks: Hookable<GIHooks>
}

export type GIConfig = MultipleConfig | SingleConfig[]

export interface GIHooks {
  /**
   * 配置项初始化完成时触发
   * @param config 配置项
   * @param ctx 执行上下文对象
   */
  configureResolved: (config: ResolvedConfig, ctx: GIContext) => void

  /**
   * 路径列表处理完成时触发
   * @param paths 路径列表
   * @param ctx 执行上下文对象
   */
  pathsResolved: (paths: string[], ctx: GIContext) => void

  /**
   * 代码块生成后触发
   * @param codes 代码块列表
   * @param ctx 执行上下文对象
   */
  codesGenerated: (codes: string[], ctx: GIContext) => void

  /**
   * 文件内容生成后触发
   * @param content 待写入文件内容
   * @param ctx 执行上下文对象
   */
  contentGenerated: (content: string, ctx: GIContext) => void

  /***
   * 文件写入前触发
   * @param ctx 执行上下文对象
   */
  beforeWrite: (ctx: GIContext) => void

  /**
   * 文件写入后触发
   * @param ctx 执行上下文对象
   */
  afterWrite: (ctx: GIContext) => void

  /**
   * 路径列表为空退出前触发
   * @param ctx 执行上下文对象
   */
  empty: (ctx: GIContext) => void
}

/**
 * 生成目录入口文件
 * @param configs 配置项
 */
export async function genIndex(configs: GIConfig) {
  const normalizedConfigs = normalizeConfigs(configs)
  for (const config of normalizedConfigs) {
    await runTask(config).catch((e) => {
      config.onError(castError(e))
      if (config.exitWhenError)
        exit(1)
    })
  }
}

/**
 * 执行任务
 * @param config 配置项
 */
export async function runTask(config: ResolvedConfig) {
  // 创建上下文对象
  const ctx = createContext(config)
  const { hooks } = ctx

  // 设置当前工作目录
  config.cwd = normalizePath(resolve(config.cwd, config.input))
  fs.ensureDirSync(config.cwd)

  // 获取路径列表
  ctx.paths = resolvePaths(config)

  // 设置输出文件
  config.outFile = resolveOutFile(ctx)

  // 配置项已确认
  await hooks.callHook('configureResolved', config, ctx)

  // 识别扩展名
  ctx.extName = extname(config.outFile)

  // 过滤路径列表
  ctx.paths = processPaths(ctx.paths, config)

  // 路径已确认
  await hooks.callHook('pathsResolved', ctx.paths, ctx)

  // 为空时中断后续操作
  if (!config.allowEmpty && ctx.paths.length === 0) {
    hooks.callHook('empty', ctx)
    return
  }

  // 生成代码列表
  ctx.codes = ctx.paths.map((path) => config.genCode(resolveModulePath(path, config.cwd)))

  // 生成代码列表已确认
  await hooks.callHook('codesGenerated', ctx.codes, ctx)

  // 生成文件内容
  ctx.content = genContent(ctx)

  // 待写入文件内容已确认
  await hooks.callHook('contentGenerated', ctx.content, ctx)

  // 写入文件
  await hooks.callHook('beforeWrite', ctx)
  fs.writeFileSync(config.outFile, ctx.content, { encoding: 'utf-8' })
  await hooks.callHook('afterWrite', ctx)

  hooks.removeAllHooks()
}

/**
 * 生成文件内容
 * @param ctx 执行上下文对象
 */
export function genContent(ctx: GIContext) {
  const { codes, config } = ctx
  let content = codes.join('\n')
  if (config.insertFinalNewline && !/(\r)?\n$/.test(content))
    content += '\n'
  return content
}

/**
 * 获取模块相对工作空间的路径，同级时不以无相对路径前缀
 * @param path 模块路径
 * @param cwd 工作空间路径
 */
export function resolveModulePath(path: string, cwd: string) {
  return posix.relative(cwd, path)
}

/**
 * 处理路径列表
 * 1. 过滤路径列表（`include`、`exclude`）
 * 2. 排除非 `outFile` 同扩展名路径
 * 3. 移除路径扩展名
 * @param paths 路径列表
 * @param config 配置项
 */
export function processPaths(paths: string[], config: ResolvedConfig) {
  const filter = createFilter(config.include, config.exclude, { resolve: config.cwd })
  paths = paths.filter((p) => filter(p) && !p.endsWith(config.outFile))

  // 移除路径扩展名
  if (!config.preserveExtName) {
    const extName = extname(config.outFile)
    paths = paths.map((p) => p.replace(extName, ''))
  }

  return paths
}

/**
 * 获取输出文件
 * @param ctx 执行上下文对象
 */
export function resolveOutFile(ctx: GIContext) {
  const { config, paths } = ctx
  return normalizePath(
    resolve(config.cwd, config.outFile ? config.outFile : `index${extname(paths[0] || '')}`),
  )
}

/**
 * 根据配置项获取路径列表（未过滤）
 * @param config 配置项
 */
export function resolvePaths(config: ResolvedConfig) {
  return globSync('**/*', {
    cwd: config.cwd,
    absolute: true,
    onlyFiles: config.onlyFiles,
    onlyDirectories: config.onlyDirectories,
    dot: true,
    ...config.glob,
  }).map(normalizePath)
}

/**
 * 创建执行上下文对象
 * @param config 配置项
 */
function createContext(config: ResolvedConfig): GIContext {
  const ctx = {
    config,
    paths: [],
    codes: [],
    hooks: createHooks(),
  } as GIContext

  // 注册事件回调
  if (config.hooks)
    ctx.hooks.addHooks(config.hooks)

  return ctx
}

/**
 * 统一化配置项列表
 * @param configs 配置项列表
 */
export function normalizeConfigs(configs: GIConfig): ResolvedConfig[] {
  if (!Array.isArray(configs)) {
    configs = configs.dirs.map((cfg) => {
      return {
        ...configs,
        ...(isString(cfg) ? { input: cfg } : cfg),
      }
    })
  }
  return configs.map(normalizeConfig)
}

/**
 * 统一化配置项
 * @param config 配置项
 */
export function normalizeConfig(config: SingleConfig): ResolvedConfig {
  return {
    cwd: getCwd(),
    glob: {},
    preserveExtName: false,
    allowEmpty: true,
    genCode: defaultGenCode,
    insertFinalNewline: true,
    exitWhenError: true,
    onError: (e) => {
      console.error('task error:', e.message)
    },
    ...config,
  } as ResolvedConfig
}

/**
 * 默认代码生成方式
 * @param module 模块路径
 */
function defaultGenCode(module: string) {
  return `export * from './${module}'`
}
