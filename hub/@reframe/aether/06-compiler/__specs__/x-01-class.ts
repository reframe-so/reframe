export class Foo {
  constructor() {
    console.log("Foo");
  }
}
const Bar = class Baz {};
var Qux = class Baz extends Foo {};
class Foo1 {
}
export { Bar, Qux as Qux1 };

export default Foo;
