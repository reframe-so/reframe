export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.test1 = async function () {
      'use worker:test1'
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  })
    .block(1, (Env, Self) => {
      Env.test2 = async function () {
        'use worker:test2'
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    })
    .block(2, (Env, Self) => {
      Env.test3 = async function () {
        'use server'
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    })
    .block(3, (Env, Self) => {
      Env.Foo = function () {
        'use client'
        return Env._jsx('div', {
          onClick: async () => {
            await Env.test1()
            await Env.test2()
            await Env.test3()
          },
          children: 'Foo',
        })
      }
    })