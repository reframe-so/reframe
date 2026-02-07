export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.Bar = function (Bar) {
      return [Bar]
    }
  })