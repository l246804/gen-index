#!/usr/bin/env node
import { Command } from 'commander'
import { loadConfig } from 'unconfig'
import type { GIConfig } from './node'
import { genIndex } from './node'

const program = new Command()

program
  .name('gi')
  .description('生成目录入口文件')
  .version(__VERSION__, '-v, --version')
  .option('-c --config <file>', '指定配置文件')
  .action(({ config }) => genIndexWithConfig(config))

program.parse()

function genIndexWithConfig(file = 'gi.config') {
  return loadConfig<GIConfig>({ sources: { files: file } }).then(({ config = { dirs: [] } }) =>
    genIndex(config),
  )
}
