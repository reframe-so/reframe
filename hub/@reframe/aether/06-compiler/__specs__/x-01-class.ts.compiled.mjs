export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.Qux = undefined
    return async () => {
      Env.Foo = class {
        constructor() {
          Self.console.log('Foo')
        }
      }
      Env.Qux = class Baz extends Env.Foo {}
    }
  })
    .block(1, (Env, Self) => {
      return async () => {
        Env.Bar = class Baz {}
      }
    })
    .block(2, (Env, Self) => {
      return async () => {
        Env.Foo1 = class {}
      }
    })