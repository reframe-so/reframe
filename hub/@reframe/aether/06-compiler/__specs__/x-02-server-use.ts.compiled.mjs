export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.Foo = function () {}
    return async () => {
      Env.Foo1 = Env.Foo
    }
  })
    .block(1, (Env, Self) => {
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
      Env.Bar = async function () {
        'use server'
      }
    })
    .block(4, (Env, Self) => {
      Env.Baz = function () {
        'use client'
      }
    })