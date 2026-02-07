import React from "npm:react";
import { Link } from "../components/link.tsx";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
  params: Record<string, string>;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex gap-6">
          <Link href="/" className="font-bold text-blue-600">
            Home
          </Link>
          <Link href="/about" className="text-gray-600 hover:text-blue-600">
            About
          </Link>
          <Link href="/dashboard" className="text-gray-600 hover:text-blue-600">
            Dashboard
          </Link>
          <Link href="/blog/hello-world" className="text-gray-600 hover:text-blue-600">
            Blog
          </Link>
          <Link href="/docs/getting-started" className="text-gray-600 hover:text-blue-600">
            Docs
          </Link>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
          Kitchen Sink Demo - Reframe Framework
        </div>
      </footer>
    </div>
  );
}
