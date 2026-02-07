async function test1() {
  "use worker:test1";

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

async function test2() {
  "use worker:test2";

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

async function test3() {
  "use server";

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

export default function Foo() {
  "use client";

  return (
    <div
      onClick={async () => {
        await test1();
        await test2();
        await test3();
      }}
    >
      Foo
    </div>
  );
}
