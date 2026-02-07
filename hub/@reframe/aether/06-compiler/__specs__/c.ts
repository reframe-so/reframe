export function foo1(bar: number = foo1(() => {
  foo1 = 20;
})): number {
  foo1 = 10;
}

export function foo2(foo2 = () => {
  foo2 = 20;
}): number {
  foo2 = 10;
}

const foo3 = function foo3() {
  foo3 = 10;
};

const foo4 = function foo4(foo4 = () => {
  foo4 = 20;
}) {
  foo4 = 10;
};

const foo5 = function foo5(bar = foo5(() => {
  foo5 = 20;
})) {
  foo5 = 10;
};

const foo6 = function foo6(bar = foo6((foo6) => {
  foo6 = 20;
})) {
  foo6 = 10;
};

export function foo7(bar: number = foo7((foo7) => {
  foo7 = 20;
})): number {
  foo7 = 10;
}

export const foo8 = (foo8 = () => {
  foo8 = 20;
}): number => {
  foo8 = 10;
};

export const foo9 = (bar = foo9(() => {
  foo9 = 20;
})) => {
  foo9 = 10;
};

export const foo10 = (bar = foo10((foo10) => {
  foo10 = 20;
})) => {
  foo10 = 10;
};
