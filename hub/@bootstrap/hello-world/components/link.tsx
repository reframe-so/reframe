import React from "npm:react";
import { useRouter } from "@bootstrap/router/outlet.tsx";

export function Link({
  href,
  children,
  className,
}: {
  href: `/${string}`;
  children: React.ReactNode;
  className?: string;
}) {
  "use client";

  const router = useRouter();

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        router.push(href);
      }}
      className={className}
    >
      {children}
    </a>
  );
}
