import { setupGenerators } from '@rhao/plop-generators'

export default (plop) => {
  setupGenerators(plop, {
    configGenerator: {
      autoInstall: true
    }
  })
}
