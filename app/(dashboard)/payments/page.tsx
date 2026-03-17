"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { CreditCard, Wallet, Landmark, Smartphone, TrendingUp, Calendar, Search, ArrowUpRight, RefreshCw, X } from "lucide-react"

type Payment = {
  id: string
  amount: number
  payment_mode: string
  payment_date: string
  transaction_reference: string | null
  order_id: string
  orders: {
    order_number: string
    customers: { name: string } | null
  } | null
}

type ModeFilter = "All" | "Cash" | "UPI" | "Bank Transfer" | "Card"

const MODE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  Cash:          { icon: Wallet,      color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  UPI:           { icon: Smartphone,  color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  "Bank Transfer":{ icon: Landmark,   color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  Card:          { icon: CreditCard,  color: "text-slate-700",  bg: "bg-slate-50",  border: "border-slate-200" },
  Online:        { icon: Smartphone,  color: "text-cyan-700",   bg: "bg-cyan-50",   border: "border-cyan-200" },
}
const getModeConfig = (mode: string) => MODE_CONFIG[mode] || MODE_CONFIG["Card"]

function fmt(n: number) { return "₹" + Math.round(n).toLocaleString("en-IN") }
function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export default function PaymentsPage() {
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [modeFilter, setModeFilter] = useState<ModeFilter>("All")
  const [search, setSearch] = useState("")
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchPayments = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from("payments")
      .select(`
        id, amount, payment_mode, payment_date, transaction_reference, order_id,
        orders(order_number, customers(name))
      `)
      .gte("payment_date", startDate + "T00:00:00")
      .lte("payment_date", endDate + "T23:59:59")
      .order("payment_date", { ascending: false })

    if (!error && data) setPayments(data as unknown as Payment[])
    setIsLoading(false)
  }, [startDate, endDate, supabase])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  // ── Filtered ──
  const filtered = payments.filter(p => {
    const matchesMode = modeFilter === "All" || p.payment_mode === modeFilter
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      p.orders?.order_number?.toLowerCase().includes(q) ||
      p.orders?.customers?.name?.toLowerCase().includes(q) ||
      p.transaction_reference?.toLowerCase().includes(q) || false
    return matchesMode && matchesSearch
  })

  // ── Summaries ──
  const totalAll = filtered.reduce((s, p) => s + Number(p.amount), 0)
  const byMode: Record<string, number> = {}
  filtered.forEach(p => {
    byMode[p.payment_mode] = (byMode[p.payment_mode] || 0) + Number(p.amount)
  })

  const modes: ModeFilter[] = ["All", "Cash", "UPI", "Bank Transfer", "Card"]

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Payment Transactions</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track all inflows by mode and period</p>
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
        <input
          type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium"
        />
        <span className="text-slate-400 text-sm">to</span>
        <input
          type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium"
        />
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text" placeholder="Search order, customer, ref…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button onClick={fetchPayments} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* ── Mode Filter Tabs + Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {modes.map(mode => {
          const amount = mode === "All" ? totalAll : (byMode[mode] || 0)
          const count = mode === "All" ? filtered.length : filtered.filter(p => p.payment_mode === mode).length
          const cfg = mode !== "All" ? getModeConfig(mode) : null
          const Icon = cfg?.icon || TrendingUp
          const isActive = modeFilter === mode
          return (
            <button
              key={mode}
              onClick={() => setModeFilter(mode)}
              className={`flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all ${
                isActive
                  ? "bg-slate-900 border-slate-900 text-white shadow-md"
                  : `bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm ${cfg?.color || "text-slate-700"}`
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${isActive ? "text-white" : cfg?.color || "text-slate-500"}`} />
                <span className={`text-xs font-bold ${isActive ? "text-white" : "text-slate-600"}`}>{mode}</span>
              </div>
              <p className={`text-lg font-black leading-tight ${isActive ? "text-white" : "text-slate-800"}`}>
                {fmt(amount)}
              </p>
              <p className={`text-[10px] font-semibold ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                {count} transaction{count !== 1 ? "s" : ""}
              </p>
            </button>
          )
        })}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-sm">
            {modeFilter === "All" ? "All Transactions" : modeFilter + " Transactions"}
          </h3>
          <span className="text-xs text-slate-400 font-semibold">{filtered.length} records</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading transactions...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No transactions found for this period / filter</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Order</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Mode</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Reference</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(p => {
                  const cfg = getModeConfig(p.payment_mode)
                  const Icon = cfg.icon
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-600 text-xs whitespace-nowrap">
                        {fmtDateTime(p.payment_date)}
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => router.push(`/orders/${p.order_id}`)}
                          className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 text-xs"
                        >
                          {p.orders?.order_number || "—"}
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-700">
                        {p.orders?.customers?.name || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                          <Icon className="h-3 w-3" />
                          {p.payment_mode}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">
                        {p.transaction_reference || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-green-700 text-sm">
                        {fmt(Number(p.amount))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={5} className="px-5 py-3 font-bold text-slate-700 text-sm text-right uppercase tracking-wide">Total Collected</td>
                  <td className="px-5 py-3 text-right font-black text-slate-900 text-lg">{fmt(totalAll)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}