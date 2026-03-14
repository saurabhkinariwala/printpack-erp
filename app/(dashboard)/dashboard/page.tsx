"use client"

import { Pencil, Layers, Globe, Users, Plus } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import Link from "next/link"
import { useRouter } from "next/navigation"
// ... (Keep the exact same lineData and pieData arrays here from the previous code) ...
const lineData = [
  { name: 'Jan', sales: 0 }, { name: 'Feb', sales: 150 }, { name: 'Mar', sales: 110 }, { name: 'Apr', sales: 240 },
  { name: 'May', sales: 200 }, { name: 'Jun', sales: 200 }, { name: 'Jul', sales: 300 }, { name: 'Aug', sales: 200 },
  { name: 'Sep', sales: 380 }, { name: 'Oct', sales: 300 }, { name: 'Nov', sales: 400 }, { name: 'Dec', sales: 380 },
]

const pieData = [
  { name: 'Mobile', value: 38.5, color: '#3b82f6' }, { name: 'Tablet', value: 30.8, color: '#06b6d4' },
  { name: 'Desktop', value: 7.7, color: '#8b5cf6' }, { name: 'Other', value: 23.1, color: '#f3f4f6' },
]

export default function DashboardOverview() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      
      {/* Interactive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Overview</h2>
          <div className="text-sm text-slate-500 font-medium mt-1">
            <Link href="/dashboard" className="text-blue-600 hover:underline">Home</Link> &gt; Dashboard
          </div>
        </div>
        
        {/* Functional Route Button */}
        <button 
          onClick={() => router.push('/orders/new')}
          className="flex items-center gap-2 bg-[#1e232d] hover:bg-slate-800 text-white px-4 py-2.5 rounded-md text-sm font-semibold transition-all shadow-md w-fit"
        >
          <Plus className="h-4 w-4" />
          New Order
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: "Total Income", value: "953,000", icon: Pencil, color: "text-blue-500", bg: "bg-blue-50" },
          { title: "Total Expense", value: "236,000", icon: Layers, color: "text-cyan-500", bg: "bg-cyan-50" },
          { title: "Total Assets", value: "987,563", icon: Globe, color: "text-indigo-500", bg: "bg-indigo-50" },
          { title: "Total Staff", value: "987,563", icon: Users, color: "text-blue-600", bg: "bg-blue-50" }
        ].map((card, index) => (
          <div key={index} className="flex items-center p-6 bg-white rounded-lg shadow-sm border border-slate-100">
            <div className={`flex items-center justify-center h-14 w-14 rounded-full ${card.bg} ${card.color} mr-4`}>
              <card.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">{card.title}</p>
              <h3 className="text-2xl font-bold text-slate-700">{card.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Line Chart */}
        <div className="col-span-1 lg:col-span-2 bg-white rounded-lg shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex justify-between items-center p-6 border-b border-slate-100">
            <h3 className="text-lg font-semibold text-slate-700">Sales Overview</h3>
            <select className="border-slate-200 text-slate-500 text-sm rounded-md p-1 outline-none bg-slate-50">
              <option>January 2026</option>
            </select>
          </div>
          
          <div className="flex items-center bg-blue-600 text-white px-6 py-4">
             <div className="flex-1">
                <p className="text-blue-200 text-sm">Total Sales</p>
                <p className="text-xl font-bold">$10,345</p>
             </div>
             <div className="flex-1 hidden sm:block">
                <p className="text-blue-200 text-sm">This Month</p>
                <p className="text-xl font-bold">$7,589</p>
             </div>
             <div className="flex-1 hidden sm:block">
                <p className="text-blue-200 text-sm">This Week</p>
                <p className="text-xl font-bold">$1,476</p>
             </div>
          </div>

          <div className="p-6 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 20, right: 30, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-700 mb-6">Visit Separation</h3>
          <div className="h-[200px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={0} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
              <span className="text-xl font-bold text-slate-800">Visits</span>
            </div>
          </div>
          
          <div className="mt-8 space-y-4">
            {pieData.map((item, index) => (
               <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">{item.name}</span>
                  <span className="font-semibold text-slate-700">{item.value}%</span>
               </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}