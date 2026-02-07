export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.default = function () {
      return 5
    }
  })