export default (Module) =>
  Module.block(0, (Env, Self) => {
    return async () => {
      Env.default = function Baz() {
        return [Baz]
      }
    }
  })