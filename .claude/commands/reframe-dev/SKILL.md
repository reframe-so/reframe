---
name: reframe-dev
description: Use when developing the reframe framework - CLI commands, testing, and reference implementations.
---

# Reframe Development

## Reference Implementations

**Location:** `hub/@bootstrap/`

Bootstrap apps are reference implementations used for testing the framework.

- `@bootstrap/hello-world` - Kitchen sink test app covering all framework features

## CLI Commands

**Base:** `deno run -A hub/@reframe/cli/main.ts <command>`

### Server Commands
- `serve` - Start hypervisor (8000) + aether (8001)
- `hypervisor` - Hypervisor only (8000)
- `aether` - Aether only (8001)

### Org Commands
- `org list` - List all organizations
- `org create <slug>` - Create org with default "home" app

### App Commands
- `app list <org>` - List apps (org can include @)
- `app create <org> <slug>` - Create app with master branch

### Branch Commands
- `branch list <org> <app>` - List branches
- `branch read <org> <app> <branch>` - Get head commit hash
- `branch create <org> <app> <name> --from=<branch>` - Fork from branch
- `branch create <org> <app> <name> --commit=<hash>` - Fork from commit
- `branch write <org> <app> <branch> '<json>' <msg>` - Write files

#### branch write JSON format
```json
{"/@/path/to/file.tsx": "content", "/@/delete-me.ts": null}
```
- Keys are file paths (use `/@/` prefix for app files)
- Values are content strings or `null` to delete

### Commit Commands
- `commit log <hash> [--limit=N]` - History (default: 20)

### Tree Commands
- `tree read <hash>` - List files at commit (d=dir, -=file)

### Blob Commands
- `blob <hash1> [hash2...]` - Read blob content as JSON

## Manual Testing Workflow

```bash
# 1. Start servers
deno run -A hub/@reframe/cli/main.ts serve

# 2. Create org
deno run -A hub/@reframe/cli/main.ts org create myorg

# 3. Read branch head
deno run -A hub/@reframe/cli/main.ts branch read @myorg home master

# 4. Write files
deno run -A hub/@reframe/cli/main.ts branch write @myorg home master \
  '{"/@/app/page.tsx": "export default () => <h1>Hello</h1>"}' \
  "Add home page"

# 5. Read tree at commit
deno run -A hub/@reframe/cli/main.ts tree read <commit-hash>

# 6. Read file content
deno run -A hub/@reframe/cli/main.ts blob <blob-hash>
```

## Notes
- Org slugs can include `@` prefix (normalized automatically)
- Slugs must be lowercase alphanumeric with optional hyphens
- Use `null` in files.json to delete a file
