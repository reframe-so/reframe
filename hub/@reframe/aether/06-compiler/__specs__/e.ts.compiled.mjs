export default (Module) =>
  Module.block(0, (Env, Self) => {
    return async () => {
      Env.Foo1 = Env.Foo
    }
  })
    .block(1, (Env, Self) => {
      Env.Bar = function () {
        return 5
      }
      return async () => {
        Env.Bar1 = Env.Bar
      }
    })
    .block(2, (Env, Self) => {
      return async () => {
        Env.Baz1 = Env.Baz
      }
    })
    .block(3, (Env, Self) => {
      return async () => {
        Env.Qux = () => {
          return 5
        }
        Env.Qux1 = Env.Qux
      }
    })
    .block(4, (Env, Self) => {
      Env.Foo = function () {
        'use client'
        return 5
      }
    })
    .block(5, (Env, Self) => {
      Env.Baz = () => {
        'use client'
        return 5
      }
    })
    .block(6, (Env, Self) => {
      Env.A = () => {
        'use client'
      }
    })
    .block(7, (Env, Self) => {
      Env.B = () => {
        return 5
      }
    })
    .block(8, (Env, Self) => {
      Env.C = () => {
        'use client'
      }
    })
    .block(9, (Env, Self) => {
      Env.D = function () {
        return 5
      }
    })