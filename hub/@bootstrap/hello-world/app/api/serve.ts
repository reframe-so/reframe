// API endpoint - responds to all HTTP methods
export default async function serve(
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  // Example: GET /api?name=world
  if (method === "GET") {
    const name = url.searchParams.get("name") || "World";
    return Response.json({
      message: `Hello, ${name}!`,
      timestamp: new Date().toISOString(),
    });
  }

  // Example: POST /api with JSON body
  if (method === "POST") {
    try {
      const body = await request.json();
      return Response.json({
        received: body,
        echo: true,
      });
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  return Response.json(
    { error: `Method ${method} not allowed` },
    { status: 405 }
  );
}
