export default (Module) =>
  Module.block(0, (Env, Self) => {
    return async () => {
      'use strict'
    }
  })
    .block(1, (Env, Self) => {
      return async () => {
        Env.x = await import(`jjl${Env.x}`)
      }
    })
    .block(2, (Env, Self) => {
      return async () => {
        Env.foo1 = await Self.dynamic(0)
      }
    })
    .block(3, (Env, Self) => {
      return async () => {
        Env.foo2 = await Self.dynamic(1)
        Self.console.log(Env.foo2) // { foo: ..., bar: ..., baz: ... }
      }
    })
    .block(4, (Env, Self) => {
      return async () => {
        Env.bar = await Self.dynamic(2)
        Self.console.log(Env.bar) // { foo: ..., bar: ... }
      }
    })
    .block(5, (Env, Self) => {
      Env.baz = () => Self.dynamic(3)
    })
    .block(6, (Env, Self) => {
      Env.gg = function () {
        return Self.dynamic(4)
      }
    })