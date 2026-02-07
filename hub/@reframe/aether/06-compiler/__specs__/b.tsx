import Page from "./page.tsx";
import * as t from "./page.tsx";
import { Foo as Bar } from "./page.tsx";
import count from "./page.tsx";
import Client from "./client.tsx";

function lower(s: string) {
  return s.toLowerCase();
}

let txt = JSON.stringify([count, t.count]);
const mmm = txt;

var div = ({ children }) => (
  <div style={{ backgroundColor: "#ffffe0", padding: "16px" }}>
    {children}
  </div>
);

const App = () => (
  <div>
    <div style={{ border: "2px dashed blue" }}>
      <Client />
    </div>
    <Bar />
    <t.default />
    <div style={{ border: "2px dashed blue" }}>
      <t.Foo />
      <Page />
      <div style={{ border: "2px dashed green", padding: "16px" }}>
        Hello {txt}
      </div>
    </div>
  </div>
);

export function foo() {
  return bar();
}

export function bar() {
  return foo();
}

let Env = 0;
console.log(Env);
