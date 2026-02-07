export default (Module) =>
  Module.block(0, (Env_0, Self) => {
    return async () => {
      Env_0.txt = JSON.stringify([Env_0.count, Env_0.t.count])
      Env_0.mmm = Env_0.txt
    }
  })
    .block(1, (Env_0, Self) => {
      return async () => {
        Env_0.Env = 0
        Self.console.log(Env_0.Env)
      }
    })
    .block(2, (Env_0, Self) => {
      Env_0.lower = function (s) {
        return s.toLowerCase()
      }
    })
    .block(3, (Env_0, Self) => {
      Env_0.div = ({ children }) =>
        Env_0._jsx('div', {
          style: { backgroundColor: '#ffffe0', padding: '16px' },
          children: children,
        })
    })
    .block(4, (Env_0, Self) => {
      Env_0.App = () =>
        Env_0._jsxs('div', {
          children: [
            Env_0._jsx('div', {
              style: { border: '2px dashed blue' },
              children: Env_0._jsx(Env_0.Client, {}),
            }),
            Env_0._jsx(Env_0.Bar, {}),
            Env_0._jsx(Env_0.t.default, {}),
            Env_0._jsxs('div', {
              style: { border: '2px dashed blue' },
              children: [
                Env_0._jsx(Env_0.t.Foo, {}),
                Env_0._jsx(Env_0.Page, {}),
                Env_0._jsxs('div', {
                  style: { border: '2px dashed green', padding: '16px' },
                  children: ['Hello ', Env_0.txt],
                }),
              ],
            }),
          ],
        })
    })
    .block(5, (Env_0, Self) => {
      Env_0.foo = function () {
        return Env_0.bar()
      }
    })
    .block(6, (Env_0, Self) => {
      Env_0.bar = function () {
        return Env_0.foo()
      }
    })