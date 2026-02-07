import React from "npm:react";
import { Link } from "../../components/link.tsx";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
  params: Record<string, string>;
}) {
  return (
    <div className="flex gap-6">
      <aside className="w-48 shrink-0">
        <nav className="bg-white rounded-lg shadow p-4 space-y-2">
          <h3 className="font-semibold text-gray-900 mb-3">Dashboard</h3>
          <Link
            href="/dashboard"
            className="block px-3 py-2 rounded hover:bg-gray-100 text-gray-700"
          >
            Overview
          </Link>
          <Link
            href="/dashboard/settings"
            className="block px-3 py-2 rounded hover:bg-gray-100 text-gray-700"
          >
            Settings
          </Link>
        </nav>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
