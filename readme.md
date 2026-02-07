### Why

- end user sandboxing
  - we have the ability to ship different code/data version for individual user
- in-app editing
  - end users / ai can write code, with or without code editor
- no build step
  - we can run code as soon as it's written
- no deploy step
  - we can deploy code as soon as it's written
- point in time code snapshot
- point in time data snapshot

---

```bash
# runs hypervisor on 8000
$ reframe serve --data data --secret password

# creates an org @foo, with default app @foo/home and branch @foo/home/master
# with a minimal hello world template
$ reframe org create foo

# prints { hello: 'world' }
$ curl foo.localhost:8000
```
