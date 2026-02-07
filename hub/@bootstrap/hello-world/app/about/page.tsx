import React from "npm:react";
import { Link } from "../../components/link.tsx";

export default function AboutPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">About</h1>
      <p className="text-gray-600">
        This is a simple about page demonstrating basic routing.
      </p>
      <div className="p-4 bg-blue-50 rounded-lg">
        <p className="text-blue-800">
          This page has no special middleware or layout - it inherits from the root.
        </p>
      </div>
      <Link href="/" className="text-blue-600 hover:underline">
        ← Back to Home
      </Link>
    </div>
  );
}
