import { ts } from "./system.ts";
import { Surprise } from "../t.ts";

export class CompilerSurprise extends Surprise.extend("compiler") {}

export class UnexpectedSurprise
  extends CompilerSurprise.extend<{ message: string }>(
    "unexpected",
    (ctx) => ctx.message,
  ) {}

export const ASTSurprise = CompilerSurprise.extend<{
  message: string;
  node: ts.Node;
}>(
  "ast",
  (ctx) =>
    `${ctx.message} at ${
      (() => {
        try {
          return ctx.node.getText();
        } catch {
          // use a printer
          const printer = ts.createPrinter();
          return printer.printNode(
            ts.EmitHint.Unspecified,
            ctx.node,
            ctx.node.getSourceFile(),
          );
        }
      })()
    }`,
);
