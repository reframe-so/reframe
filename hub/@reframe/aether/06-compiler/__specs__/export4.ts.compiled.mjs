export default (Module) =>
  Module.block(0, (Env, Self) => {
    return async () => {
      Env.Foo = { x: 2 }
    }
  })