import React from "npm:react";

// Server action for dashboard
async function refreshData() {
  "use server";
  await new Promise((r) => setTimeout(r, 500));
  return {
    users: Math.floor(Math.random() * 1000),
    revenue: Math.floor(Math.random() * 50000),
    orders: Math.floor(Math.random() * 200),
  };
}

function StatsCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-sm text-gray-500 uppercase tracking-wide">{title}</h3>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}

function DashboardStats() {
  "use client";

  const [stats, setStats] = React.useState({ users: 0, revenue: 0, orders: 0 });
  const [loading, setLoading] = React.useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    const data = await refreshData();
    setStats(data);
    setLoading(false);
  };

  React.useEffect(() => {
    handleRefresh();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Stats</h2>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatsCard title="Users" value={stats.users.toLocaleString()} />
        <StatsCard title="Revenue" value={`$${stats.revenue.toLocaleString()}`} />
        <StatsCard title="Orders" value={stats.orders} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Overview</h1>
        <p className="text-gray-600 mt-1">
          This page has a nested layout and auth middleware.
        </p>
      </div>
      <DashboardStats />
    </div>
  );
}
