const z = 10;
const x = {
  b: function () {
    "use tracer 234";
    return z;
  },
};

function foo(args) {
  "use tracer";
  bar();
  return baz();
}

async function barr(args) {
  "use tracer notbar";
  var x = 10;
  barrz();
  await bar();
  return Baz();
}

const bar = async (args) => {
  "use tracer";
  await barr();
  return qux();
};

const object = {
  baz(args) {
    "use tracer";
    return qux();
  },
};

class Foo {
  bar(args) {
    "use tracer";
    await bar();
    return () => {
      "use tracer bazzz";
      return baz();
    };
  }
  get(args) {
    "use tracer";
    return baz();
  }
}

const y = Foo();
