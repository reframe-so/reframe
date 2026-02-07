import React, { Suspense } from "npm:react";
import { ErrorBoundary } from "npm:react-error-boundary";

async function Await({ promise }: { promise: Promise<React.ReactNode> }) {
  return await promise;
}

export const Async = <T,>({
  value,
  use,
  catch: _catch,
  loading: Loading,
}: {
  value: () => Promise<T>;
  loading?: () => React.ReactNode;
  use: (value: T) => React.ReactNode | Promise<React.ReactNode>;
  catch?: (error: unknown) => React.ReactNode | Promise<React.ReactNode>;
}) => {
  return (
    <Suspense fallback={Loading ? <Loading /> : null}>
      <Await
        promise={value().then(
          use,
          _catch ?? ((error: unknown) => <Recover surprise={error} />),
        )}
      />
    </Suspense>
  );
};

export const Guard = ({ children }: { children: React.ReactNode }) => (
  <ErrorBoundary
    FallbackComponent={({ error }) => <Recover surprise={error} />}
  >
    <Suspense>{children}</Suspense>
  </ErrorBoundary>
);

type ErrorAction = unknown;

export function Recover({ surprise, actions: _actions = [] }: {
  surprise: unknown;
  actions?: ErrorAction[];
}) {
  "use client";
  return (
    <pre>{surprise instanceof Error ? surprise.stack : String(surprise)}</pre>
  );
}
