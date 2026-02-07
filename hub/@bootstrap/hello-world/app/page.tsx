import React from "npm:react";

// Server action example
async function incrementCounter(current: number) {
  "use server";
  // Simulate some server-side work
  await new Promise((r) => setTimeout(r, 100));
  return current + 1;
}

// Client component with state
function Counter() {
  "use client";

  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    setLoading(true);
    const newCount = await incrementCounter(count);
    setCount(newCount);
    setLoading(false);
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <p className="text-2xl font-bold mb-4">Count: {count}</p>
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? "Loading..." : "Increment (Server Action)"}
      </button>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-4">Hello World Kitchen Sink</h1>
        <p className="text-gray-600">
          This demo showcases pages, layouts, middleware, server actions, client
          components, and routing.
        </p>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">Server Action + Client State</h2>
        <Counter />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Features Demonstrated</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Root layout with navigation</li>
          <li>Nested layouts (see Dashboard)</li>
          <li>Middleware for request logging</li>
          <li>Server actions with "use server"</li>
          <li>Client components with "use client"</li>
          <li>Dynamic routes (/blog/:slug)</li>
          <li>Wildcard routes (/docs/::path)</li>
          <li>API endpoints (/api)</li>
          <li>Link component with client-side navigation</li>
        </ul>
      </section>
    </div>
  );
}
