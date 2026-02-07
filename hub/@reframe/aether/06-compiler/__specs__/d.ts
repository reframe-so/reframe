var { a } = {};
const { b } = {};
let { c } = {};

export var { d } = {};

e = f;

a = b;
var { c } = d;

var [g, { h = foo, i: [j] = a }] = k;

var y = "yy";
var x = { [y]: 5 };
var { [x.yy]: z } = {};

console.log({ a, b, c, d, e, f, g });
