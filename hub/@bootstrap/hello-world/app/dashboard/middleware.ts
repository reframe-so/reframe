import type { Middleware } from "@bootstrap/router/index.tsx";

// Dashboard middleware - simulates auth check
const middleware: Middleware<{}> = async (request, next, _context) => {
  const url = new URL(request.url);

  // Check for auth cookie/header (simulated)
  const isAuthenticated = request.headers.get("x-auth-token") !== null ||
    request.headers.get("cookie")?.includes("auth=");

  console.log(`[Dashboard] Auth check for ${url.pathname}: ${isAuthenticated ? "OK" : "Guest"}`);

  // For demo purposes, we allow access but log the auth status
  // In real app: if (!isAuthenticated) return Response.redirect("/login");

  const response = await next(request);

  // Add custom header to show middleware ran
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("x-dashboard-middleware", "true");

  return newResponse;
};

export default middleware;
