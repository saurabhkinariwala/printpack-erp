"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts"
import {
  TrendingUp, ShoppingCart, CreditCard, AlertTriangle, Plus,
  Download, Calendar, RefreshCw, Package, Users, ArrowUpRight, X, Printer
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
type SalesPeriod = { label: string; total: number }
type TopProduct = { name: string; sku: string; qty: number; revenue: number; category: string }
type LowStockItem = { name: string; sku: string; quantity: number; threshold: number; category: string }
type DayBookEntry = {
  order_number: string; order_id: string; customer_name: string;
  items: { name: string; qty: number; unit_price: number }[];
  total_amount: number; payments_on_day: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return "₹" + Math.round(n).toLocaleString("en-IN") }
function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) }

const COLORS = ["#3b82f6","#06b6d4","#8b5cf6","#f59e0b","#10b981","#ef4444","#ec4899","#84cc16","#f97316","#64748b"]

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  // date range - default: first of current month to today
  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [isLoading, setIsLoading] = useState(true)

  // KPIs
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [totalCollected, setTotalCollected] = useState(0)
  const [totalPending, setTotalPending] = useState(0)

  // Charts
  const [salesTrend, setSalesTrend] = useState<SalesPeriod[]>([])
  const [topBakery, setTopBakery] = useState<TopProduct[]>([])
  const [topGiftBoxes, setTopGiftBoxes] = useState<TopProduct[]>([])

  // Low stock
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])

  // Day book
  const [dayBookDate, setDayBookDate] = useState(today)
  const [dayBookData, setDayBookData] = useState<DayBookEntry[]>([])
  const [isDayBookOpen, setIsDayBookOpen] = useState(false)
  const [isDayBookLoading, setIsDayBookLoading] = useState(false)

  // ─── Main Data Fetch ─────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const endDateInclusive = endDate + "T23:59:59"

    // 1. Orders in range
    const { data: ordersData } = await supabase
      .from("orders")
      .select(`
        id, total_amount, order_date, status,
        customers(name),
        order_items(
          quantity_ordered, unit_price,
          items(name, sku, sub_categories(name, categories(name)))
        ),
        payments(amount, payment_date)
      `)
      .gte("order_date", startDate)
      .lte("order_date", endDate)
      .order("order_date", { ascending: true })

    if (!ordersData) { setIsLoading(false); return }

    // ── KPIs ──
    let rev = 0, collected = 0
    ordersData.forEach(o => {
      rev += Number(o.total_amount) || 0
      o.payments?.forEach((p: any) => { collected += Number(p.amount) || 0 })
    })
    setTotalRevenue(rev)
    setTotalCollected(collected)
    setTotalPending(rev - collected)
    setTotalOrders(ordersData.length)

    // ── Sales Trend (day/week/month based on range) ──
    const diffDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
    const trendMap: Record<string, number> = {}

    ordersData.forEach(o => {
      let key: string
      const d = new Date(o.order_date)
      if (diffDays <= 31) {
        key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
      } else if (diffDays <= 90) {
        // group by week
        const weekNum = Math.ceil(d.getDate() / 7)
        key = d.toLocaleDateString("en-IN", { month: "short" }) + " W" + weekNum
      } else {
        key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
      }
      trendMap[key] = (trendMap[key] || 0) + (Number(o.total_amount) || 0)
    })

    setSalesTrend(Object.entries(trendMap).map(([label, total]) => ({ label, total })))

    // ── Top 10 products per category ──
    const productMap: Record<string, { qty: number; revenue: number; name: string; sku: string; category: string }> = {}

    ordersData.forEach(o => {
      o.order_items?.forEach((oi: any) => {
        const item = oi.items
        if (!item) return
        const catName = item.sub_categories?.categories?.name || "Other"
        const key = item.sku
        if (!productMap[key]) {
          productMap[key] = { name: item.name, sku: item.sku, qty: 0, revenue: 0, category: catName }
        }
        productMap[key].qty += oi.quantity_ordered || 0
        productMap[key].revenue += (oi.quantity_ordered || 0) * (Number(oi.unit_price) || 0)
      })
    })

    const allProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty)
    setTopBakery(allProducts.filter(p => p.category.toLowerCase().includes("bak")).slice(0, 10))
    setTopGiftBoxes(allProducts.filter(p => p.category.toLowerCase().includes("gift")).slice(0, 10))

    // ── Low Stock ──
    const { data: stockData } = await supabase
      .from("stock")
      .select(`
        quantity, item_id,
        items(name, sku, sub_categories(name, categories(name)))
      `)

    const lowStock: LowStockItem[] = []
    if (stockData) {
      // Aggregate qty per item
      const itemQtyMap: Record<string, { qty: number; name: string; sku: string; category: string }> = {}
      stockData.forEach((s: any) => {
        const item = s.items
        if (!item) return
        const catName = item.sub_categories?.categories?.name || ""
        if (!itemQtyMap[s.item_id]) {
          itemQtyMap[s.item_id] = { qty: 0, name: item.name, sku: item.sku, category: catName }
        }
        itemQtyMap[s.item_id].qty += s.quantity || 0
      })
      Object.entries(itemQtyMap).forEach(([, v]) => {
        const isBakery = v.category.toLowerCase().includes("bak")
        const isGift = v.category.toLowerCase().includes("gift")
        const threshold = isBakery ? 400 : isGift ? 100 : null
        if (threshold !== null && v.qty < threshold) {
          lowStock.push({ name: v.name, sku: v.sku, quantity: v.qty, threshold, category: v.category })
        }
      })
    }
    setLowStockItems(lowStock.sort((a, b) => a.quantity - b.quantity))
    setIsLoading(false)
  }, [startDate, endDate, supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Day Book Fetch ───────────────────────────────────────────────────────
  const fetchDayBook = async () => {
    setIsDayBookLoading(true)
    setIsDayBookOpen(true)

    const { data } = await supabase
      .from("orders")
      .select(`
        id, order_number, total_amount,
        customers(name),
        order_items(quantity_ordered, unit_price, items(name, sku)),
        payments(amount, payment_date)
      `)
      .eq("order_date", dayBookDate)
      .order("order_number")

    if (data) {
      const entries: DayBookEntry[] = data.map((o: any) => ({
        order_id: o.id,
        order_number: o.order_number,
        customer_name: o.customers?.name || "Unknown",
        items: o.order_items?.map((oi: any) => ({
          name: oi.items?.name || "Unknown",
          qty: oi.quantity_ordered,
          unit_price: Number(oi.unit_price),
        })) || [],
        total_amount: Number(o.total_amount),
        payments_on_day: o.payments
          ?.filter((p: any) => p.payment_date?.startsWith(dayBookDate))
          .reduce((s: number, p: any) => s + Number(p.amount), 0) || 0
      }))
      setDayBookData(entries)
    }
    setIsDayBookLoading(false)
  }

  // ─── Preset Range Buttons ─────────────────────────────────────────────────
  const setPreset = (preset: string) => {
    const now = new Date()
    if (preset === "today") {
      setStartDate(today); setEndDate(today)
    } else if (preset === "week") {
      const start = new Date(now); start.setDate(now.getDate() - 6)
      setStartDate(start.toISOString().split("T")[0]); setEndDate(today)
    } else if (preset === "month") {
      setStartDate(firstOfMonth); setEndDate(today)
    } else if (preset === "quarter") {
      const start = new Date(now); start.setMonth(now.getMonth() - 3)
      setStartDate(start.toISOString().split("T")[0]); setEndDate(today)
    }
  }

  const kpis = [
    { label: "Total Revenue", value: fmt(totalRevenue), icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
    { label: "Total Orders", value: totalOrders.toString(), icon: ShoppingCart, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" },
    { label: "Collected", value: fmt(totalCollected), icon: CreditCard, color: "text-green-600", bg: "bg-green-50", border: "border-green-100" },
    { label: "Pending Balance", value: fmt(totalPending), icon: ArrowUpRight, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
  ]

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Live business intelligence · PrintPack ERP</p>
        </div>
        <button
          onClick={() => router.push("/orders/new")}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md w-fit"
        >
          <Plus className="h-4 w-4" /> New Order
        </button>
      </div>

      {/* ── Date Range ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="flex items-center gap-2">
            <input
              type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium"
            />
            <span className="text-slate-400 text-sm">to</span>
            <input
              type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[["today","Today"],["week","Last 7 Days"],["month","This Month"],["quarter","Last 3 Months"]].map(([k,l]) => (
              <button key={k} onClick={() => setPreset(k)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 transition-colors border border-slate-200">{l}</button>
            ))}
          </div>
          <button onClick={fetchData} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`bg-white rounded-xl border ${k.border} shadow-sm p-5 flex items-center gap-4`}>
            <div className={`h-12 w-12 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>
              <k.icon className={`h-5 w-5 ${k.color}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{k.label}</p>
              <p className="text-xl font-black text-slate-800 mt-0.5">{isLoading ? "—" : k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Sales Trend ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" /> Sales Trend
          <span className="text-xs font-normal text-slate-400 ml-2">
            {Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) <= 31 ? "By Day" :
             Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) <= 90 ? "By Week" : "By Month"}
          </span>
        </h3>
        {isLoading ? (
          <div className="h-60 flex items-center justify-center text-slate-400 text-sm">Loading chart...</div>
        ) : salesTrend.length === 0 ? (
          <div className="h-60 flex items-center justify-center text-slate-400 text-sm">No orders in this period</div>
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => "₹" + (v >= 1000 ? (v/1000).toFixed(0)+"k" : v)} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} labelStyle={{ fontWeight: "bold", color: "#1e293b" }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Top Products ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopProductsCard title="🍞 Top 10 Bakery Products" products={topBakery} isLoading={isLoading} />
        <TopProductsCard title="🎁 Top 10 Gift Box Products" products={topGiftBoxes} isLoading={isLoading} />
      </div>

      {/* ── Low Stock Alert ── */}
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-amber-100 bg-amber-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="font-bold text-slate-800">Low Stock Alerts</h3>
            <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">{isLoading ? "…" : lowStockItems.length}</span>
          </div>
          <p className="text-xs text-slate-500">Bakery &lt;400 · Gift Boxes &lt;100</p>
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Loading...</div>
        ) : lowStockItems.length === 0 ? (
          <div className="p-6 text-center text-green-600 text-sm font-semibold">✓ All stock levels are healthy</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Product</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Category</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">Current Qty</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">Threshold</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">Deficit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lowStockItems.map((item, i) => (
                  <tr key={i} className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{item.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{item.category}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-black text-base ${item.quantity === 0 ? "text-red-600" : "text-amber-600"}`}>{item.quantity}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 font-semibold">{item.threshold}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-red-600">-{item.threshold - item.quantity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sale Day Book ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Sale Day Book</h3>
          </div>
          <div className="flex items-center gap-3 sm:ml-auto">
            <input
              type="date" value={dayBookDate} onChange={e => setDayBookDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 font-medium"
            />
            <button
              onClick={fetchDayBook}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm"
            >
              <Download className="h-4 w-4" /> Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* ── Day Book Modal ── */}
      {isDayBookOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
          <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Sale Day Book</h2>
                <p className="text-sm text-slate-500">All orders for {fmtDate(dayBookDate)}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button onClick={() => setIsDayBookOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isDayBookLoading ? (
                <div className="py-20 text-center text-slate-400">Loading day book...</div>
              ) : dayBookData.length === 0 ? (
                <div className="py-20 text-center text-slate-400">No orders found for {fmtDate(dayBookDate)}</div>
              ) : (
                <div className="space-y-4">
                  {dayBookData.map((entry, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between bg-slate-800 text-white px-4 py-3">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => router.push(`/orders/${entry.order_id}`)}
                            className="font-bold text-blue-300 hover:text-blue-200 underline underline-offset-2 text-sm"
                          >
                            {entry.order_number}
                          </button>
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm font-semibold">{entry.customer_name}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Order Value</p>
                          <p className="font-black text-white">{fmt(entry.total_amount)}</p>
                        </div>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="text-left px-4 py-2 text-slate-500 font-bold uppercase">Product</th>
                            <th className="text-right px-4 py-2 text-slate-500 font-bold uppercase">Qty</th>
                            <th className="text-right px-4 py-2 text-slate-500 font-bold uppercase">Rate</th>
                            <th className="text-right px-4 py-2 text-slate-500 font-bold uppercase">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {entry.items.map((item, j) => (
                            <tr key={j} className="hover:bg-slate-50">
                              <td className="px-4 py-2 font-medium text-slate-700">{item.name}</td>
                              <td className="px-4 py-2 text-right font-bold text-slate-800">{item.qty}</td>
                              <td className="px-4 py-2 text-right text-slate-500">{fmt(item.unit_price)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-slate-700">{fmt(item.qty * item.unit_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-slate-200 bg-slate-50">
                          <tr>
                            <td colSpan={3} className="px-4 py-2.5 font-bold text-slate-600 text-right">Order Total</td>
                            <td className="px-4 py-2.5 font-black text-slate-800 text-right">{fmt(entry.total_amount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))}

                  {/* ── Day Book Summary ── */}
                  <div className="mt-6 p-5 bg-slate-900 rounded-xl text-white">
                    <h4 className="font-bold mb-3 text-slate-300 uppercase text-xs tracking-wider">Day Summary · {fmtDate(dayBookDate)}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-slate-400 text-xs">Total Orders</p>
                        <p className="text-2xl font-black">{dayBookData.length}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">Gross Revenue</p>
                        <p className="text-2xl font-black text-blue-300">{fmt(dayBookData.reduce((s, e) => s + e.total_amount, 0))}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">Collected Today</p>
                        <p className="text-2xl font-black text-green-300">{fmt(dayBookData.reduce((s, e) => s + e.payments_on_day, 0))}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Top Products Card Component ─────────────────────────────────────────────
function TopProductsCard({ title, products, isLoading }: { title: string; products: TopProduct[]; isLoading: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <h3 className="font-bold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">By quantity sold in period</p>
      </div>
      {isLoading ? (
        <div className="p-6 text-center text-slate-400 text-sm">Loading...</div>
      ) : products.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">No sales in this period</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={products.slice(0, 5)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} width={120}
                  tickFormatter={v => v.length > 18 ? v.substring(0, 17) + "…" : v} />
                <Tooltip formatter={(v: unknown) => [v != null ? `${v} units` : "—", "Qty"]} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11 }} />
                <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                  {products.slice(0, 5).map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="text-left py-2 text-slate-400 font-bold">#</th>
                  <th className="text-left py-2 text-slate-400 font-bold">Product</th>
                  <th className="text-right py-2 text-slate-400 font-bold">Qty</th>
                  <th className="text-right py-2 text-slate-400 font-bold">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {products.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-1.5 pr-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ background: COLORS[i % COLORS.length] }}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <p className="font-semibold text-slate-700 leading-tight">{p.name}</p>
                      <p className="text-slate-400 font-mono text-[10px]">{p.sku}</p>
                    </td>
                    <td className="py-1.5 text-right font-black text-slate-800">{p.qty}</td>
                    <td className="py-1.5 text-right font-semibold text-green-700">{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}