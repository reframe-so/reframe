import React from "npm:react";
import { Link } from "../../../components/link.tsx";

// Simulated blog post data
const posts: Record<string, { title: string; content: string; date: string }> = {
  "hello-world": {
    title: "Hello World",
    content: "This is the first blog post demonstrating dynamic routing.",
    date: "2024-01-15",
  },
  "getting-started": {
    title: "Getting Started with Reframe",
    content: "Learn how to build apps with the Reframe framework.",
    date: "2024-01-20",
  },
  "advanced-routing": {
    title: "Advanced Routing Patterns",
    content: "Deep dive into layouts, middleware, and wildcards.",
    date: "2024-01-25",
  },
};

export default function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = posts[params.slug];

  if (!post) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-red-600">Post Not Found</h1>
        <p className="text-gray-600">
          No blog post found for slug: <code className="bg-gray-100 px-2 py-1 rounded">{params.slug}</code>
        </p>
        <Link href="/" className="text-blue-600 hover:underline">
          ← Back to Home
        </Link>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="text-sm text-gray-500 mb-2">{post.date}</p>
        <h1 className="text-3xl font-bold">{post.title}</h1>
      </header>

      <div className="prose">
        <p className="text-gray-700 text-lg">{post.content}</p>
      </div>

      <div className="pt-6 border-t">
        <p className="text-sm text-gray-500 mb-4">
          Dynamic route param: <code className="bg-gray-100 px-2 py-1 rounded">slug = {params.slug}</code>
        </p>
        <div className="flex gap-4">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Home
          </Link>
          {Object.keys(posts)
            .filter((s) => s !== params.slug)
            .slice(0, 2)
            .map((slug) => (
              <Link
                key={slug}
                href={`/blog/${slug}` as `/${string}`}
                className="text-blue-600 hover:underline"
              >
                {posts[slug].title} →
              </Link>
            ))}
        </div>
      </div>
    </article>
  );
}
