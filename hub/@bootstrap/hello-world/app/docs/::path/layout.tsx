import React from "npm:react";
import { Link } from "../../../components/link.tsx";

// Wildcard route - catches all paths under /docs/
export default function DocsPage({
  params,
}: {
  params: { path: string[] };
}) {
  const pathSegments = params.path || [];
  const fullPath = pathSegments.join("/");

  // Build breadcrumb links
  const breadcrumbs = pathSegments.map((segment, index) => ({
    label: segment.replace(/-/g, " "),
    href: `/docs/${pathSegments.slice(0, index + 1).join("/")}` as `/${string}`,
  }));

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/docs/index" className="hover:text-blue-600">
          Docs
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            <span>/</span>
            <Link href={crumb.href} className="hover:text-blue-600 capitalize">
              {crumb.label}
            </Link>
          </React.Fragment>
        ))}
      </nav>

      <div>
        <h1 className="text-3xl font-bold capitalize">
          {pathSegments[pathSegments.length - 1]?.replace(/-/g, " ") || "Documentation"}
        </h1>
        <p className="text-gray-600 mt-2">
          This is a wildcard route that catches all paths under <code>/docs/</code>
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow space-y-4">
        <h2 className="font-semibold">Route Parameters</h2>
        <div className="bg-gray-50 p-4 rounded font-mono text-sm">
          <p>path = {JSON.stringify(pathSegments)}</p>
          <p>fullPath = "{fullPath}"</p>
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-lg space-y-3">
        <h2 className="font-semibold text-blue-900">Try These Links</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/docs/getting-started" className="text-blue-600 hover:underline">
            /docs/getting-started
          </Link>
          <Link href="/docs/api/reference" className="text-blue-600 hover:underline">
            /docs/api/reference
          </Link>
          <Link href="/docs/guides/routing/dynamic-routes" className="text-blue-600 hover:underline">
            /docs/guides/routing/dynamic-routes
          </Link>
        </div>
      </div>

      <Link href="/" className="inline-block text-blue-600 hover:underline">
        ← Back to Home
      </Link>
    </div>
  );
}
