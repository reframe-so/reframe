export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.a = undefined
    Env.d = undefined
    Env.c = undefined
    Env.g = undefined
    Env.h = undefined
    Env.j = undefined
    return async () => {
      var { a } = {}
      Env.a = a
      const { b } = {}
      Env.b = b
      var { d } = {}
      Env.d = d
      Env.a = Env.b
      var { c } = Env.d
      Env.c = c
      var [g, { h = foo, i: [j] = Env.a }] = k
      Env.g = g
      Env.h = h
      Env.j = j
      Self.console.log({
        a: Env.a,
        b: Env.b,
        c: Env.c,
        d: Env.d,
        e,
        f,
        g: Env.g,
      })
    }
  })
    .block(1, (Env, Self) => {
      return async () => {
        let { c } = {}
        Env.c = c
      }
    })
    .block(2, (Env, Self) => {
      return async () => {
        e = f
      }
    })
    .block(3, (Env, Self) => {
      Env.y = undefined
      Env.x = undefined
      Env.z = undefined
      return async () => {
        Env.y = 'yy'
        Env.x = { [Env.y]: 5 }
        var { [Env.x.yy]: z } = {}
        Env.z = z
      }
    })