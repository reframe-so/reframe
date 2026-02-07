export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.j = undefined
    return async () => {
      Env.a = 0
      Env.h = () => Env.i
      Env.i = () => Env.j(Env.h)
      Env.j = Env.i(Env.a)
    }
  })
    .block(1, (Env, Self) => {
      return async () => {
        Env.b = 0
        Env.k = 0
        Env.l = Env.k * Env.b
      }
    })
    .block(2, (Env, Self) => {
      Env.c = undefined
      Env.x = function () {
        Env.z = Env.y
        Env.c = Env.z
        Env.y = Env.e
        return Env.y + Env.e
      }
      Env.z = function () {
        return 0
      }
      return async () => {
        Env.c = 0
        Env.e = 1
        Env.y = Env.x(Env.z)
      }
    })
    .block(3, (Env, Self) => {
      return async () => {
        Env.f = 2
      }
    })
    .block(4, (Env, Self) => {
      Env.g = undefined
      return async () => {
        Env.g = 3
      }
    })
    .block(5, (Env, Self) => {
      Env.v = function () {
        return Env.w + Env.c
      }
    })
    .block(6, (Env, Self) => {
      Env.w = function () {
        Env.z = Env.y
        Env.c = Env.z
        Env.y = Env.e
        Env.e = Env.w
        Env.w = Env.e
        const kk = {
          a: 1,
          b: Env.w,
          c: Env.w().m,
        }
        return Env.x + d
      }
    })
    .block(7, (Env, Self) => {
      Env.mm = () => 5
    })