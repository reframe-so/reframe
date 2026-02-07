import { assertEquals } from "jsr:@std/assert";
import { hosts, parseRequest } from "./router.ts";

// Helper to create a mock request
function mockRequest(
  url: string,
  options?: { cookies?: Record<string, string> },
): Request {
  const headers = new Headers();
  if (options?.cookies) {
    const cookieStr = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers.set("cookie", cookieStr);
  }
  return new Request(url, { headers });
}

Deno.test("parseRequest > frame-first mode", async (ctx) => {
  await ctx.step("foo.reframe.dev -> org: reframe, frame: foo", () => {
    const result = parseRequest(mockRequest("https://foo.reframe.dev/"));
    assertEquals(result, { org: "reframe", frame: "foo", branch: "master" });
  });

  await ctx.step("foo--bar.reframe.dev -> org: foo, frame: bar", () => {
    const result = parseRequest(mockRequest("https://foo--bar.reframe.dev/"));
    assertEquals(result, { org: "foo", frame: "bar", branch: "master" });
  });

  await ctx.step(
    "foo--bar--baz.reframe.dev -> org: foo, frame: bar, branch: baz",
    () => {
      const result = parseRequest(
        mockRequest("https://foo--bar--baz.reframe.dev/"),
      );
      assertEquals(result, { org: "foo", frame: "bar", branch: "baz" });
    },
  );

  await ctx.step("foo.reframe.so -> org: reframe, frame: foo", () => {
    const result = parseRequest(mockRequest("https://foo.reframe.so/"));
    assertEquals(result, { org: "reframe", frame: "foo", branch: "master" });
  });
});

Deno.test("parseRequest > org-first mode", async (ctx) => {
  // Setup .sh domain with org-first mode
  hosts.set("reframe.sh", { org: "reframe" });

  await ctx.step("foo.reframe.sh -> org: foo, frame: home", () => {
    const result = parseRequest(mockRequest("https://foo.reframe.sh/"));
    assertEquals(result, { org: "foo", frame: "home", branch: "master" });
  });

  await ctx.step("foo--bar.reframe.sh -> org: foo, frame: bar", () => {
    const result = parseRequest(mockRequest("https://foo--bar.reframe.sh/"));
    assertEquals(result, { org: "foo", frame: "bar", branch: "master" });
  });

  await ctx.step(
    "foo--bar--baz.reframe.sh -> org: foo, frame: bar, branch: baz",
    () => {
      const result = parseRequest(
        mockRequest("https://foo--bar--baz.reframe.sh/"),
      );
      assertEquals(result, { org: "foo", frame: "bar", branch: "baz" });
    },
  );

  // Cleanup
  hosts.delete("reframe.sh");
});

Deno.test("parseRequest > org-first mode with configured host", async (ctx) => {
  // Setup .sh domain with org-first mode
  hosts.set("reframe.sh", { org: "reframe" });

  await ctx.step("foo.reframe.sh -> org: foo, frame: home (org-first)", () => {
    const result = parseRequest(mockRequest("https://foo.reframe.sh/"));
    assertEquals(result, { org: "foo", frame: "home", branch: "master" });
  });

  await ctx.step("foo--bar.reframe.sh -> org: foo, frame: bar", () => {
    const result = parseRequest(mockRequest("https://foo--bar.reframe.sh/"));
    assertEquals(result, { org: "foo", frame: "bar", branch: "master" });
  });

  // Cleanup
  hosts.delete("reframe.sh");
});

Deno.test("parseRequest > exact hostname match", async (ctx) => {
  // Setup domains in hosts map
  hosts.set("reframe.dev", { org: "reframe" });
  hosts.set("reframe.sh", { org: "reframe" });
  hosts.set("reframe.so", { org: "reframe" });

  await ctx.step(
    "reframe.dev -> org: reframe, frame: home, branch: master",
    () => {
      const result = parseRequest(mockRequest("https://reframe.dev/"));
      assertEquals(result, { org: "reframe", frame: "home", branch: "master" });
    },
  );

  await ctx.step(
    "reframe.sh -> org: reframe, frame: home, branch: master",
    () => {
      const result = parseRequest(mockRequest("https://reframe.sh/"));
      assertEquals(result, { org: "reframe", frame: "home", branch: "master" });
    },
  );

  await ctx.step(
    "reframe.so -> org: reframe, frame: home, branch: master",
    () => {
      const result = parseRequest(mockRequest("https://reframe.so/"));
      assertEquals(result, { org: "reframe", frame: "home", branch: "master" });
    },
  );

  await ctx.step(
    "localhost -> org: reframe, frame: home, branch: master",
    () => {
      const result = parseRequest(mockRequest("http://localhost/"));
      assertEquals(result, { org: "reframe", frame: "home", branch: "master" });
    },
  );

  // Cleanup
  hosts.delete("reframe.dev");
  hosts.delete("reframe.sh");
  hosts.delete("reframe.so");
});

Deno.test("parseRequest > cookie override", async (ctx) => {
  // Setup domains in hosts map
  hosts.set("reframe.dev", { org: "reframe" });
  hosts.set("reframe.sh", { org: "reframe" });

  await ctx.step(
    "x-reframe-branch cookie overrides branch in org-first",
    () => {
      const result = parseRequest(
        mockRequest("https://foo.reframe.dev/", {
          cookies: { "x-reframe-branch": "feature" },
        }),
      );
      assertEquals(result, { org: "foo", frame: "home", branch: "feature" });
    },
  );

  await ctx.step(
    "x-reframe-branch cookie overrides branch (.sh configured as org-first)",
    () => {
      const result = parseRequest(
        mockRequest("https://foo.reframe.sh/", {
          cookies: { "x-reframe-branch": "feature" },
        }),
      );
      assertEquals(result, { org: "foo", frame: "home", branch: "feature" });
    },
  );

  await ctx.step(
    "x-reframe-branch cookie overrides explicit branch in URL",
    () => {
      const result = parseRequest(
        mockRequest("https://foo--bar--baz.reframe.sh/", {
          cookies: { "x-reframe-branch": "feature" },
        }),
      );
      assertEquals(result, { org: "foo", frame: "bar", branch: "feature" });
    },
  );

  await ctx.step("empty x-reframe-branch cookie is ignored", () => {
    const result = parseRequest(
      mockRequest("https://foo.reframe.dev/", {
        cookies: { "x-reframe-branch": "  " },
      }),
    );
    assertEquals(result, { org: "foo", frame: "home", branch: "master" });
  });

  // Cleanup
  hosts.delete("reframe.dev");
  hosts.delete("reframe.sh");
});

Deno.test("parseRequest > custom subdomains override", async (ctx) => {
  // Setup test domain
  hosts.set("example.com", {
    org: "default-org",
    subdomains: {
      api: { org: "api-org", frame: "api-frame", branch: "api-branch" },
      admin: { org: "admin-org" },
      beta: { branch: "beta" },
    },
  });

  await ctx.step(
    "example.com -> org: default-org, frame: home, branch: master",
    () => {
      const result = parseRequest(mockRequest("https://example.com/"));
      assertEquals(result, {
        org: "default-org",
        frame: "home",
        branch: "master",
      });
    },
  );

  await ctx.step(
    "api.example.com -> full override from subdomains config",
    () => {
      const result = parseRequest(mockRequest("https://api.example.com/"));
      assertEquals(result, {
        org: "api-org",
        frame: "api-frame",
        branch: "api-branch",
      });
    },
  );

  await ctx.step("admin.example.com -> partial override (org only)", () => {
    const result = parseRequest(mockRequest("https://admin.example.com/"));
    assertEquals(result, {
      org: "admin-org",
      frame: "home",
      branch: "master",
    });
  });

  await ctx.step("beta.example.com -> partial override (branch only)", () => {
    const result = parseRequest(mockRequest("https://beta.example.com/"));
    assertEquals(result, {
      org: "default-org",
      frame: "home",
      branch: "beta",
    });
  });

  await ctx.step(
    "other.example.com -> org-first mode (not in subdomains)",
    () => {
      const result = parseRequest(mockRequest("https://other.example.com/"));
      assertEquals(result, {
        org: "other",
        frame: "home",
        branch: "master",
      });
    },
  );

  // Cleanup
  hosts.delete("example.com");
});

Deno.test("parseRequest > frame-first with custom subdomains", async (ctx) => {
  // Setup test domain (no org = frame-first)
  hosts.set("dev.example.com", {
    subdomains: {
      staging: { branch: "staging" },
    },
  });

  await ctx.step(
    "dev.example.com -> org: reframe, frame: home, branch: master",
    () => {
      const result = parseRequest(mockRequest("https://dev.example.com/"));
      assertEquals(result, {
        org: "reframe",
        frame: "home",
        branch: "master",
      });
    },
  );

  await ctx.step(
    "staging.dev.example.com -> subdomain override for branch",
    () => {
      const result = parseRequest(
        mockRequest("https://staging.dev.example.com/"),
      );
      assertEquals(result, {
        org: "reframe",
        frame: "home",
        branch: "staging",
      });
    },
  );

  await ctx.step(
    "foo.dev.example.com -> frame-first mode (not in subdomains)",
    () => {
      const result = parseRequest(mockRequest("https://foo.dev.example.com/"));
      assertEquals(result, {
        org: "reframe",
        frame: "foo",
        branch: "master",
      });
    },
  );

  // Cleanup
  hosts.delete("dev.example.com");
});

Deno.test("parseRequest > edge cases", async (ctx) => {
  await ctx.step("unknown.domain.com -> falls back to defaults", () => {
    const result = parseRequest(mockRequest("https://unknown.domain.com/"));
    assertEquals(result, {
      org: "reframe",
      frame: "unknown",
      branch: "master",
    });
  });

  await ctx.step("a--b--c--d.reframe.dev -> extra parts stay in branch", () => {
    const result = parseRequest(mockRequest("https://a--b--c--d.reframe.dev/"));
    assertEquals(result, {
      org: "a",
      frame: "b",
      branch: "c--d",
    });
  });

  await ctx.step("--foo.reframe.dev -> leading delimiter", () => {
    const result = parseRequest(mockRequest("https://--foo.reframe.dev/"));
    assertEquals(result, {
      org: "",
      frame: "foo",
      branch: "master",
    });
  });

  await ctx.step("foo--.reframe.dev -> trailing delimiter", () => {
    const result = parseRequest(mockRequest("https://foo--.reframe.dev/"));
    assertEquals(result, {
      org: "foo",
      frame: "",
      branch: "master",
    });
  });
});
