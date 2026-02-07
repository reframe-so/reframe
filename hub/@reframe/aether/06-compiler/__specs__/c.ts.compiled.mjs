export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.foo1 = function (
      bar = Env.foo1(() => {
        Env.foo1 = 20
      }),
    ) {
      Env.foo1 = 10
    }
  })
    .block(1, (Env, Self) => {
      Env.foo2 = function (
        foo2 = () => {
          foo2 = 20
        },
      ) {
        foo2 = 10
      }
    })
    .block(2, (Env, Self) => {
      Env.foo3 = function foo3() {
        foo3 = 10
      }
    })
    .block(3, (Env, Self) => {
      Env.foo4 = function foo4(
        foo4 = () => {
          foo4 = 20
        },
      ) {
        foo4 = 10
      }
    })
    .block(4, (Env, Self) => {
      Env.foo5 = function foo5(
        bar = foo5(() => {
          foo5 = 20
        }),
      ) {
        foo5 = 10
      }
    })
    .block(5, (Env, Self) => {
      Env.foo6 = function foo6(
        bar = foo6((foo6) => {
          foo6 = 20
        }),
      ) {
        foo6 = 10
      }
    })
    .block(6, (Env, Self) => {
      Env.foo7 = function (
        bar = Env.foo7((foo7) => {
          foo7 = 20
        }),
      ) {
        Env.foo7 = 10
      }
    })
    .block(7, (Env, Self) => {
      Env.foo8 = (
        foo8 = () => {
          foo8 = 20
        },
      ) => {
        foo8 = 10
      }
    })
    .block(8, (Env, Self) => {
      Env.foo9 = (
        bar = Env.foo9(() => {
          Env.foo9 = 20
        }),
      ) => {
        Env.foo9 = 10
      }
    })
    .block(9, (Env, Self) => {
      Env.foo10 = (
        bar = Env.foo10((foo10) => {
          foo10 = 20
        }),
      ) => {
        Env.foo10 = 10
      }
    })