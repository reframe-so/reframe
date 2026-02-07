export default (Module) =>
  Module.block(0, (Env, Self) => {
    return async () => {
      Env.t = 2
    }
  })
    .block(1, (Env, Self) => {
      return async () => {
        Env.x = [Env.foo, Env.bar]
      }
    })
    .block(2, (Env, Self) => {
      return async () => {
        debugger
      }
    })
    .block(3, (Env, Self) => {
      Env.foo = function () {
        'use client'
        return Env.F + Env.t
      }
    })
    .block(4, (Env, Self) => {
      Env.bar = async function () {
        'use server'
        return Env.C
      }
    })