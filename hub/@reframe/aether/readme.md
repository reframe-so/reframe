# Aether: A Modular JavaScript/TypeScript Runtime System

Aether is a fresh, modular JavaScript/TypeScript runtime system inspired by
Nether, designed with clearer separation of concerns and improved composability.

## 🎯 Overview

Aether implements a layered, modular runtime system where each component cleanly
composes with others through explicit contracts. The system is built using
TypeScript and follows strict patterns for error handling, testing, and code
organization.

## 📁 Layer Structure

The system is organized into numbered layers, each building upon previous ones:

- **00-base**: Core utilities and types
- **01-database**: Database abstraction layer
- **02-storage**: Object storage layer (planned)
- **03-kv**: Key-Value store layer
- **04-blob**: Blob storage layer
- **05-yan**: Version control layer
- **06-compiler**: Module compilation layer
- **08-reader**: Module reader layer
- **07-linker**: Dependency linking layer
- **09-evaluator**: Module evaluation layer
- **10-server**: Server layer
- **xx-stage**: Staging area for testing

## 🧩 Core Patterns

### Factory Pattern

Components are created using a factory pattern:

```typescript
export const myComponent = t.factory(
  class implements MyInterface {
    #dependency: Dependency;

    constructor(dependency: t.Factory<Dependency>) {
      this.#dependency = dependency();
    }
  },
);

// Usage
const instance = myComponent(dependencyFactory)();
```

### Error Handling

Errors are handled through the `Surprise` pattern:

```typescript
// Layer-specific Surprise class
export class KVSurprise extends t.Surprise.extend<{}>("kv") {}

// One-off errors
throw t.Surprise.with`module not found: ${specifier.serialize()}`;

// Common error patterns
export class KeyNotFoundSurprise extends KVSurprise.extend<{
  key: string;
}>("key-not-found", (ctx) => `key not found: ${ctx.key}`) {}
```

### Testing Pattern

Each layer follows a consistent testing pattern:

```typescript
// Interface tests (interface.spec.ts)
export const test = (kv: KV) => async (ctx: Deno.TestContext) => {
  await ctx.step("set and get", async () => {
    // Test implementation
  });
};

// Implementation tests (simple.spec.ts)
import { test } from "./interface.spec.ts";
import { simple } from "./simple.mock.ts";

Deno.test("implementation", async (t) => {
  await t.step("implements interface", test(simple()));
});
```

## 📦 Development

### Prerequisites

- Deno runtime
- TypeScript understanding
- Knowledge of modular system design

### Getting Started

1. Clone the repository
2. Follow the implementation guidelines in `.cursor/rules`
3. Run tests for the layer you're working on

### Running Tests

```bash
deno test
```

## 📘 Documentation

Each layer maintains its own documentation:

- `interface.ts` - Interface definitions and type documentation
- `readme.md` - Layer-specific documentation (if needed)
- Test files - Usage examples and expected behavior

## 🤝 Contributing

1. Read the implementation guidelines in `.cursor/rules`
2. Follow the layered architecture pattern
3. Maintain test coverage
4. Document changes and learnings

## 📝 Known TODOs

These items are tracked with "RIGHT:" comments in the codebase:

### KV Layer (03-kv/simple.ts)

- Remove sync operation in set method
- Remove redundant code in get method

### Linker Layer (07-linker/simple.ts)

- Add support for re-exports
- Implement symbol-only following

### Evaluator Layer (09-evaluator/evaluator.ts)

- Clarify purpose of directive
- Fix method signature issues
