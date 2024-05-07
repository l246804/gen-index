# `gen-index`

生成指定目录下的入口文件。

## 安装

- npm
```shell
npm i -D @rhao/gen-index
```

- yarn
```shell
yarn add -D @rhao/gen-index
```

- pnpm
```shell
pnpm add -D @rhao/gen-index
```

## 使用

### 基础用法

创建配置文件 `gi.config.[js|ts|mjs|cjs|json]`。

> 默认生成的 `index.*` 后缀名由匹配到的文件列表首个文件获取，特殊情况下也可手动设置 `outFile` 达成自定义后缀名效果。

```ts
// gi.config.ts
import { defineConfig } from '@rhao/gen-index'

export default defineConfig({
  dirs: ['src/hooks'], // 指定需要生成入口文件的目录列表
})
```

可通过 `npx gi` 执行或设置 `package.json` 脚本。

```json
{
  // ...

  "scripts": {
    // ...
    "gi": "gi"
  }
}
```

### 自定义代码生成

> 默认的 `genCode` 仅生成 `ESModule` 格式的 `Re-Export` 代码，可通过配置 `genCode` 自定义代码生成。

```ts
// gi.config.ts
import { defineConfig } from '@rhao/gen-index'

export default defineConfig({
  dirs: [
    'src/hooks',
    {
      input: 'src/styles',
      // 指定 scss 文件的 genCode
      genCode: (module) => `@import './${module}.scss';`
    }
  ],
  // 指定默认的 genCode
  genCode: (module) => `export * from './${module.replace('/index', '')}'`
})
```

### 清除入口文件

> 默认情况下支持空文件写入，若需在特定场景下清空入口文件可通过提供单独配置实现。

```ts
// gi.config.ts

// ...
```

```ts
// ri.config.ts
import { defineConfig } from '@rhao/gen-index'
import config from './gi.config'

export default defineConfig({
  // 若 config.dirs 中有特殊设置需覆盖
  ...config,
  allowEmpty: true, // 必须为 true
  exclude: '**/*' // 必须排除所有文件
})
```

可通过 `npx gi -c ri.config` 执行或设置 `package.json` 脚本。

```json
{
  // ...

  "scripts": {
    // ...
    "gi": "gi",
    "ri": "gi -c ri.config"
  }
}
```
