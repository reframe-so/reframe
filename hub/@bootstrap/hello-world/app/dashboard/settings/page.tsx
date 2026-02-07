import React from "npm:react";

async function saveSettings(formData: FormData) {
  "use server";
  const name = formData.get("name");
  const email = formData.get("email");
  console.log("[Server] Saving settings:", { name, email });
  await new Promise((r) => setTimeout(r, 300));
  return { success: true, name, email };
}

function SettingsForm() {
  "use client";

  const [status, setStatus] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setStatus("Saving...");
    const result = await saveSettings(formData);
    setStatus(`Saved! Welcome, ${result.name}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          type="text"
          name="name"
          defaultValue="John Doe"
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email"
          name="email"
          defaultValue="john@example.com"
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <button
        type="submit"
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        Save Settings
      </button>
      {status && (
        <p className="text-sm text-green-600">{status}</p>
      )}
    </form>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-600 mt-1">
          Nested page under dashboard with form + server action.
        </p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <SettingsForm />
      </div>
    </div>
  );
}
