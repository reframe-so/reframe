import type { Middleware } from "@bootstrap/router/index.tsx";

// Root middleware - logs all requests
const middleware: Middleware<{}> = async (request, next, _context) => {
  const start = performance.now();
  const url = new URL(request.url);

  console.log(`[${request.method}] ${url.pathname}`);

  const response = await next(request);

  const duration = (performance.now() - start).toFixed(2);
  console.log(`[${request.method}] ${url.pathname} - ${response.status} (${duration}ms)`);

  return response;
};

export default middleware;
