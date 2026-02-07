export default (Module) =>
  Module.block(0, (Env, Self) => {
    return async () => {
      'use strict'
    }
  })
    .block(1, (Env, Self) => {
      return async () => {
        Env.z = 10
        Env.x = {
          b: function () {
            return Self.trace('234', () => {
              'use tracer 234'
              return Env.z
            })
          },
        }
      }
    })
    .block(2, (Env, Self) => {
      Env.barr = async function (args) {
        return Self.trace('notbar', async () => {
          'use tracer notbar'
          var x = 10
          barrz()
          await Env.bar()
          return Baz()
        })
      }
      return async () => {
        Env.bar = async (args) => {
          return Self.trace(async () => {
            'use tracer'
            await Env.barr()
            return qux()
          })
        }
        Env.Foo = class {
          bar(args) {
            return Self.trace(() => {
              'use tracer'
              await Env.bar()
              return () => {
                return Self.trace('bazzz', () => {
                  'use tracer bazzz'
                  return baz()
                })
              }
            })
          }
          get(args) {
            return Self.trace(() => {
              'use tracer'
              return baz()
            })
          }
        }
        Env.y = Env.Foo()
      }
    })
    .block(3, (Env, Self) => {
      return async () => {
        Env.object = {
          baz(args) {
            return Self.trace(() => {
              'use tracer'
              return qux()
            })
          },
        }
      }
    })
    .block(4, (Env, Self) => {
      Env.foo = function (args) {
        return Self.trace(() => {
          'use tracer'
          Env.bar()
          return baz()
        })
      }
    })