export default (Module) =>
  Module.block(0, (Env, Self) => {
    Env.Foo = function () {
      return [Env.Foo]
    }
  })