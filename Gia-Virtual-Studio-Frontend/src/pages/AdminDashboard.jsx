import { useState, useEffect } from 'react';
import { Users, TrendingUp, Image, FileText } from 'lucide-react';

export default function AdminDashboard() {
  const [stats] = useState({
    users: 12480,
    designs: 2450,
    collections: 18,
    activeVotes: 8734
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">Admin Dashboard</h1>
          <div className="text-sm text-gray-400">Welcome, Administrator</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {[
            { label: "Total Users", value: stats.users.toLocaleString(), icon: Users },
            { label: "Total Designs", value: stats.designs.toLocaleString(), icon: Image },
            { label: "Collections", value: stats.collections, icon: TrendingUp },
            { label: "Votes Today", value: stats.activeVotes.toLocaleString(), icon: FileText },
          ].map((stat, i) => (
            <div key={i} className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
              <stat.icon className="w-10 h-10 text-pink-500 mb-6" />
              <div className="text-4xl font-bold mb-1">{stat.value}</div>
              <div className="text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 rounded-3xl p-8">
          <h2 className="text-2xl font-semibold mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button className="bg-zinc-800 hover:bg-zinc-700 p-8 rounded-2xl text-left transition">
              <p className="font-medium">Trigger Blog Scraping</p>
              <p className="text-sm text-gray-400 mt-2">Run Trend Curation Agent</p>
            </button>
            <button className="bg-zinc-800 hover:bg-zinc-700 p-8 rounded-2xl text-left transition">
              <p className="font-medium">Generate New Collection</p>
              <p className="text-sm text-gray-400 mt-2">Start Design Coordination Cycle</p>
            </button>
            <button className="bg-pink-600 hover:bg-pink-500 p-8 rounded-2xl text-left transition">
              <p className="font-medium">Export User Data</p>
              <p className="text-sm text-white mt-2">Download all user information</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}