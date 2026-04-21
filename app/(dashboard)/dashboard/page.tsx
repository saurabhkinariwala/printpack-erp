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
  Download, Calendar, RefreshCw, Package, Users, ArrowUpRight, X, Printer, Receipt, List
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
type SalesPeriod = { label: string; total: number }
type TopProduct = { name: string; sku: string; qty: number; revenue: number; category: string }
type LowStockItem = { name: string; sku: string; quantity: number; threshold: number; category: string }
type DayBookEntry = {
  document_number: string; document_id: string; customer_name: string;
  items: { name: string; qty: number; unit_price: number }[];
  total_amount: number; payments_on_day: number
}
type ItemReportEntry = {
  name: string;
  sku: string;
  total_qty: number;
  memos: { id: string; num: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return "₹" + Math.round(n).toLocaleString("en-IN") }
function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) }

const COLORS = ["#3b82f6","#06b6d4","#8b5cf6","#f59e0b","#10b981","#ef4444","#ec4899","#84cc16","#f97316","#64748b"]

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [activeView, setActiveView] = useState<"Orders" | "Cash Memos">("Orders")

  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [isLoading, setIsLoading] = useState(true)

  // KPIs
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalTransactions, setTotalTransactions] = useState(0)
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

  // Item Report
  const [itemReportStart, setItemReportStart] = useState(firstOfMonth)
  const [itemReportEnd, setItemReportEnd] = useState(today)
  const [itemReportData, setItemReportData] = useState<ItemReportEntry[]>([])
  const [isItemReportOpen, setIsItemReportOpen] = useState(false)
  const [isItemReportLoading, setIsItemReportLoading] = useState(false)

  // ─── Main Data Fetch ─────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const endDateInclusive = endDate + "T23:59:59"

    let rev = 0, collected = 0, transactionCount = 0
    const trendMap: Record<string, number> = {}
    const productMap: Record<string, { qty: number; revenue: number; name: string; sku: string; category: string }> = {}

    const diffDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)

    if (activeView === "Orders") {
      const { data: ordersData } = await supabase
        .from("orders")
        .select(`
          id, total_amount, order_date, status,
          customers(name),
          order_items(quantity_ordered, unit_price, items(name, sku, sub_categories(name, categories(name)))),
          payments(amount, payment_date)
        `)
        .gte("order_date", startDate)
        .lte("order_date", endDate)
        .order("order_date", { ascending: true })

      if (ordersData) {
        transactionCount = ordersData.length
        ordersData.forEach(o => {
          rev += Number(o.total_amount) || 0
          o.payments?.forEach((p: any) => { collected += Number(p.amount) || 0 })

          let key: string
          const d = new Date(o.order_date)
          if (diffDays <= 31) key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
          else if (diffDays <= 90) key = d.toLocaleDateString("en-IN", { month: "short" }) + " W" + Math.ceil(d.getDate() / 7)
          else key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
          
          trendMap[key] = (trendMap[key] || 0) + (Number(o.total_amount) || 0)

          o.order_items?.forEach((oi: any) => {
            const item = oi.items
            if (!item) return
            const catName = item.sub_categories?.categories?.name || "Other"
            if (!productMap[item.sku]) productMap[item.sku] = { name: item.name, sku: item.sku, qty: 0, revenue: 0, category: catName }
            productMap[item.sku].qty += oi.quantity_ordered || 0
            productMap[item.sku].revenue += (oi.quantity_ordered || 0) * (Number(oi.unit_price) || 0)
          })
        })
      }
    } else {
      const { data: memoData } = await supabase
        .from("cash_memos")
        .select(`
          id, total_amount, memo_date, customer_name,
          cash_memo_items(quantity, unit_price, items(name, sku, sub_categories(name, categories(name)))),
          payments(amount, payment_date)
        `)
        .gte("memo_date", startDate)
        .lte("memo_date", endDate)
        .order("memo_date", { ascending: true })

      if (memoData) {
        transactionCount = memoData.length
        memoData.forEach(m => {
          rev += Number(m.total_amount) || 0
          m.payments?.forEach((p: any) => { collected += Number(p.amount) || 0 })

          let key: string
          const d = new Date(m.memo_date)
          if (diffDays <= 31) key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
          else if (diffDays <= 90) key = d.toLocaleDateString("en-IN", { month: "short" }) + " W" + Math.ceil(d.getDate() / 7)
          else key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
          
          trendMap[key] = (trendMap[key] || 0) + (Number(m.total_amount) || 0)

          m.cash_memo_items?.forEach((cmi: any) => {
            const item = cmi.items
            if (!item) return
            const catName = item.sub_categories?.categories?.name || "Other"
            if (!productMap[item.sku]) productMap[item.sku] = { name: item.name, sku: item.sku, qty: 0, revenue: 0, category: catName }
            productMap[item.sku].qty += cmi.quantity || 0
            productMap[item.sku].revenue += (cmi.quantity || 0) * (Number(cmi.unit_price) || 0)
          })
        })
      }
    }

    setTotalRevenue(rev)
    setTotalCollected(collected)
    setTotalPending(rev - collected)
    setTotalTransactions(transactionCount)
    setSalesTrend(Object.entries(trendMap).map(([label, total]) => ({ label, total })))

    const allProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty)
    setTopBakery(allProducts.filter(p => p.category.toLowerCase().includes("bak")).slice(0, 10))
    setTopGiftBoxes(allProducts.filter(p => p.category.toLowerCase().includes("gift")).slice(0, 10))

    const { data: stockData } = await supabase.from("stock").select(`quantity, item_id, items(name, sku, sub_categories(name, categories(name)))`)
    const lowStock: LowStockItem[] = []
    if (stockData) {
      const itemQtyMap: Record<string, { qty: number; name: string; sku: string; category: string }> = {}
      stockData.forEach((s: any) => {
        const item = s.items
        if (!item) return
        const catName = item.sub_categories?.categories?.name || ""
        if (!itemQtyMap[s.item_id]) itemQtyMap[s.item_id] = { qty: 0, name: item.name, sku: item.sku, category: catName }
        itemQtyMap[s.item_id].qty += s.quantity || 0
      })
      Object.entries(itemQtyMap).forEach(([, v]) => {
        const isBakery = v.category.toLowerCase().includes("bak")
        const isGift = v.category.toLowerCase().includes("gift")
        const threshold = isBakery ? 400 : isGift ? 100 : null
        if (threshold !== null && v.qty < threshold) lowStock.push({ name: v.name, sku: v.sku, quantity: v.qty, threshold, category: v.category })
      })
    }
    setLowStockItems(lowStock.sort((a, b) => a.quantity - b.quantity))
    setIsLoading(false)
  }, [startDate, endDate, activeView, supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Day Book Fetch ───────────────────────────────────────────────────────
  const fetchDayBook = async () => {
    setIsDayBookLoading(true)
    setIsDayBookOpen(true)

    let entries: DayBookEntry[] = []

    if (activeView === "Orders") {
      const { data } = await supabase.from("orders").select(`
        id, order_number, total_amount, customers(name),
        order_items(quantity_ordered, unit_price, items(name, sku)),
        payments(amount, payment_date)
      `).eq("order_date", dayBookDate).order("order_number")

      if (data) {
        entries = data.map((o: any) => ({
          document_id: o.id, document_number: o.order_number,
          customer_name: o.customers?.name || "Unknown",
          items: o.order_items?.map((oi: any) => ({ name: oi.items?.name || "Unknown", qty: oi.quantity_ordered, unit_price: Number(oi.unit_price) })) || [],
          total_amount: Number(o.total_amount),
          payments_on_day: o.payments?.filter((p: any) => p.payment_date?.startsWith(dayBookDate)).reduce((s: number, p: any) => s + Number(p.amount), 0) || 0
        }))
      }
    } else {
      const { data } = await supabase.from("cash_memos").select(`
        id, memo_number, total_amount, customer_name,
        cash_memo_items(quantity, unit_price, items(name, sku)),
        payments(amount, payment_date)
      `).eq("memo_date", dayBookDate).order("memo_number")

      if (data) {
        entries = data.map((m: any) => ({
          document_id: m.id, document_number: m.memo_number,
          customer_name: m.customer_name || "Walk-in Customer",
          items: m.cash_memo_items?.map((cmi: any) => ({ name: cmi.items?.name || "Unknown", qty: cmi.quantity, unit_price: Number(cmi.unit_price) })) || [],
          total_amount: Number(m.total_amount),
          payments_on_day: m.payments?.filter((p: any) => p.payment_date?.startsWith(dayBookDate)).reduce((s: number, p: any) => s + Number(p.amount), 0) || 0
        }))
      }
    }

    setDayBookData(entries)
    setIsDayBookLoading(false)
  }

  // ─── Fetch Item-wise Report ───────────────────────────────────────────
  const fetchItemReport = async () => {
    setIsItemReportLoading(true)
    setIsItemReportOpen(true)

    const map: Record<string, ItemReportEntry> = {}

    if (activeView === "Orders") {
      const { data } = await supabase.from("orders").select(`
        id, order_number, order_date,
        order_items(quantity_ordered, items(name, sku))
      `).gte("order_date", itemReportStart).lte("order_date", itemReportEnd).neq('status', 'Cancelled')

      if (data) {
        data.forEach((doc: any) => {
          doc.order_items?.forEach((itemLine: any) => {
            const sku = itemLine.items?.sku
            if (!sku) return
            if (!map[sku]) map[sku] = { name: itemLine.items?.name, sku, total_qty: 0, memos: [] }
            
            map[sku].total_qty += Number(itemLine.quantity_ordered) || 0
            
            if (!map[sku].memos.find(m => m.id === doc.id)) {
              map[sku].memos.push({ id: doc.id, num: doc.order_number })
            }
          })
        })
      }
    } else {
      const { data } = await supabase.from("cash_memos").select(`
        id, memo_number, memo_date,
        cash_memo_items(quantity, items(name, sku))
      `).gte("memo_date", itemReportStart).lte("memo_date", itemReportEnd)

      if (data) {
        data.forEach((doc: any) => {
          doc.cash_memo_items?.forEach((itemLine: any) => {
            const sku = itemLine.items?.sku
            if (!sku) return
            if (!map[sku]) map[sku] = { name: itemLine.items?.name, sku, total_qty: 0, memos: [] }
            
            map[sku].total_qty += Number(itemLine.quantity) || 0
            
            if (!map[sku].memos.find(m => m.id === doc.id)) {
              map[sku].memos.push({ id: doc.id, num: doc.memo_number })
            }
          })
        })
      }
    }

    setItemReportData(Object.values(map).sort((a,b) => b.total_qty - a.total_qty))
    setIsItemReportLoading(false)
  }

  // ⚡ NEW: Export Item Report to Excel
  const handleExportItemReportExcel = () => {
    if (itemReportData.length === 0) return alert("No data to export.");

    const headers = ["Product Name", "SKU", "Total Sold", `${activeView} Numbers`];
    
    const csvData = itemReportData.map(item => {
      const memosString = item.memos.map(m => m.num).join(", ");
      return [
        `"${item.name.replace(/"/g, '""')}"`, // Escape quotes
        `"${item.sku}"`,
        item.total_qty,
        `"${memosString}"`
      ].join(",");
    });

    const csvString = [headers.join(","), ...csvData].join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Item_Report_${activeView}_${itemReportStart}_to_${itemReportEnd}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const setPreset = (preset: string) => {
    const now = new Date()
    if (preset === "today") { setStartDate(today); setEndDate(today) } 
    else if (preset === "week") { const start = new Date(now); start.setDate(now.getDate() - 6); setStartDate(start.toISOString().split("T")[0]); setEndDate(today) } 
    else if (preset === "month") { setStartDate(firstOfMonth); setEndDate(today) } 
    else if (preset === "quarter") { const start = new Date(now); start.setMonth(now.getMonth() - 3); setStartDate(start.toISOString().split("T")[0]); setEndDate(today) }
  }

  const kpis = [
    { label: "Total Revenue", value: fmt(totalRevenue), icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
    { label: activeView === "Orders" ? "Total Orders" : "Total Memos", value: totalTransactions.toString(), icon: activeView === "Orders" ? ShoppingCart : Receipt, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" },
    { label: "Collected", value: fmt(totalCollected), icon: CreditCard, color: "text-green-600", bg: "bg-green-50", border: "border-green-100" },
    { label: "Pending Balance", value: fmt(totalPending), icon: ArrowUpRight, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
  ]

  return (
    <div className="flex flex-col gap-6 pb-12 print:pb-0 print:gap-0">
      <div className={`flex flex-col gap-6 ${(isDayBookOpen || isItemReportOpen) ? 'print:hidden' : ''}`}>
        
        {/* ── Header & View Toggle ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
            <p className="text-sm text-slate-500 mt-0.5">Live business intelligence</p>
          </div>
          
          <div className="flex items-center bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
            <button 
              onClick={() => setActiveView("Orders")} 
              className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm transition-all ${activeView === "Orders" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <ShoppingCart className="w-4 h-4" /> Orders
            </button>
            <button 
              onClick={() => setActiveView("Cash Memos")} 
              className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm transition-all ${activeView === "Cash Memos" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Receipt className="w-4 h-4" /> Cash Memos
            </button>
          </div>
          
          <button onClick={() => activeView === "Orders" ? router.push("/orders/new") : router.push("/cash-memo/new")} className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md w-full sm:w-fit">
            <Plus className="h-4 w-4" /> New {activeView === "Orders" ? "Order" : "Memo"}
          </button>
        </div>

        {/* ── Date Range ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium" />
              <span className="text-slate-400 text-sm">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium" />
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
              <div className={`h-12 w-12 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}><k.icon className={`h-5 w-5 ${k.color}`} /></div>
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
            <TrendingUp className="h-4 w-4 text-blue-500" /> {activeView} Sales Trend
            <span className="text-xs font-normal text-slate-400 ml-2">
              {Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) <= 31 ? "By Day" :
               Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) <= 90 ? "By Week" : "By Month"}
            </span>
          </h3>
          {isLoading ? (
            <div className="h-60 flex items-center justify-center text-slate-400 text-sm">Loading chart...</div>
          ) : salesTrend.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-slate-400 text-sm">No transactions in this period</div>
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
          <TopProductsCard title={`🍞 Top 10 Bakery Products (${activeView})`} products={topBakery} isLoading={isLoading} />
          <TopProductsCard title={`🎁 Top 10 Gift Box Products (${activeView})`} products={topGiftBoxes} isLoading={isLoading} />
        </div>

        {/* ── Low Stock Alert ── */}
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-amber-100 bg-amber-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="font-bold text-slate-800">Low Stock Alerts</h3>
              <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">{isLoading ? "…" : lowStockItems.length}</span>
            </div>
            <p className="text-xs text-slate-500">Company-wide stock levels</p>
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
                      <td className="px-4 py-3"><p className="font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-400 font-mono">{item.sku}</p></td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{item.category}</td>
                      <td className="px-4 py-3 text-right"><span className={`font-black text-base ${item.quantity === 0 ? "text-red-600" : "text-amber-600"}`}>{item.quantity}</span></td>
                      <td className="px-4 py-3 text-right text-slate-500 font-semibold">{item.threshold}</td>
                      <td className="px-4 py-3 text-right"><span className="font-bold text-red-600">-{item.threshold - item.quantity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Detailed Reports Section ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <Package className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800 text-lg">Detailed Reports ({activeView})</h3>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Day Book Tool */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
              <h4 className="font-bold text-slate-700 mb-1">Sale Day Book</h4>
              <p className="text-xs text-slate-500 mb-4">View every transaction and payment for a single specific day.</p>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input type="date" value={dayBookDate} onChange={e => setDayBookDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-medium w-full sm:w-auto" />
                <button onClick={fetchDayBook} className="flex justify-center items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm w-full sm:w-auto">
                  <Download className="h-4 w-4" /> View Day Book
                </button>
              </div>
            </div>

            {/* Item-wise Summary Tool */}
            <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
              <h4 className="font-bold text-indigo-900 mb-1">Item-wise Summary</h4>
              <p className="text-xs text-indigo-600/70 mb-4">Group sales by product over a specific date range.</p>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input type="date" value={itemReportStart} onChange={e => setItemReportStart(e.target.value)} className="flex-1 border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-medium" />
                  <span className="text-indigo-300 font-bold">to</span>
                  <input type="date" value={itemReportEnd} onChange={e => setItemReportEnd(e.target.value)} className="flex-1 border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 font-medium" />
                </div>
                <button onClick={fetchItemReport} className="flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm w-full sm:w-auto">
                  <List className="h-4 w-4" /> Generate Report
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Day Book Modal ── */}
      {isDayBookOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8 print:static print:bg-white print:p-0 print:block">
          <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col print:shadow-none print:max-h-none print:h-auto print:block">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50 shrink-0 print:p-0 print:bg-white print:border-none print:mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 print:text-2xl">{activeView} Day Book</h2>
                <p className="text-sm text-slate-500">All transactions for {fmtDate(dayBookDate)}</p>
              </div>
              <div className="flex items-center gap-3 print:hidden">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"><Printer className="h-3.5 w-3.5" /> Print</button>
                <button onClick={() => setIsDayBookOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
              {isDayBookLoading ? (
                <div className="py-20 text-center text-slate-400">Loading day book...</div>
              ) : dayBookData.length === 0 ? (
                <div className="py-20 text-center text-slate-400">No transactions found for {fmtDate(dayBookDate)}</div>
              ) : (
                <div className="space-y-4">
                  {dayBookData.map((entry, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl overflow-hidden print:border-slate-300 print:rounded-lg print:break-inside-avoid">
                      <div className="flex items-center justify-between bg-slate-800 text-white px-4 py-3 print:bg-slate-100 print:text-slate-900 print:border-b print:border-slate-300">
                        <div className="flex items-center gap-4">
                          <button onClick={() => router.push(activeView === "Orders" ? `/orders/${entry.document_id}` : `/cash-memo/${entry.document_id}`)} className="font-bold text-blue-300 hover:text-blue-200 underline underline-offset-2 text-sm print:text-slate-900 print:no-underline">
                            {entry.document_number}
                          </button>
                          <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-slate-400 print:text-slate-600" /><span className="text-sm font-semibold">{entry.customer_name}</span></div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400 print:text-slate-600">Total Value</p>
                          <p className="font-black text-white print:text-slate-900">{fmt(entry.total_amount)}</p>
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
                        <tbody className="divide-y divide-slate-50 print:divide-slate-200">
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
                            <td colSpan={3} className="px-4 py-2.5 font-bold text-slate-600 text-right">Total</td>
                            <td className="px-4 py-2.5 font-black text-slate-800 text-right">{fmt(entry.total_amount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))}

                  <div className="mt-6 p-5 bg-slate-900 rounded-xl text-white print:bg-white print:border print:border-slate-300 print:text-slate-900 print:break-inside-avoid">
                    <h4 className="font-bold mb-3 text-slate-300 uppercase text-xs tracking-wider print:text-slate-500">Day Summary · {fmtDate(dayBookDate)}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div><p className="text-slate-400 text-xs print:text-slate-500">Transactions</p><p className="text-2xl font-black">{dayBookData.length}</p></div>
                      <div><p className="text-slate-400 text-xs print:text-slate-500">Gross Revenue</p><p className="text-2xl font-black text-blue-300 print:text-slate-900">{fmt(dayBookData.reduce((s, e) => s + e.total_amount, 0))}</p></div>
                      <div><p className="text-slate-400 text-xs print:text-slate-500">Collected Today</p><p className="text-2xl font-black text-green-300 print:text-slate-900">{fmt(dayBookData.reduce((s, e) => s + e.payments_on_day, 0))}</p></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Item-wise Report Modal ── */}
      {isItemReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8 print:static print:bg-white print:p-0 print:block">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col print:shadow-none print:max-h-none print:h-auto print:block">
            <div className="flex items-center justify-between p-5 border-b border-indigo-100 bg-indigo-50 shrink-0 print:p-0 print:bg-white print:border-none print:mb-6">
              <div>
                <h2 className="text-lg font-black text-indigo-900 print:text-2xl">Item-wise Summary ({activeView})</h2>
                <p className="text-sm font-semibold text-indigo-600/70">{fmtDate(itemReportStart)} to {fmtDate(itemReportEnd)}</p>
              </div>
              <div className="flex items-center gap-3 print:hidden">
                {/* ⚡ NEW: Export Button */}
                <button onClick={handleExportItemReportExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"><Download className="h-3.5 w-3.5" /> Export Excel</button>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"><Printer className="h-3.5 w-3.5" /> Print</button>
                <button onClick={() => setIsItemReportOpen(false)} className="text-indigo-400 hover:text-red-500 transition-colors"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto print:overflow-visible print:p-0">
              {isItemReportLoading ? (
                <div className="py-20 text-center text-slate-400">Aggregating item data...</div>
              ) : itemReportData.length === 0 ? (
                <div className="py-20 text-center text-slate-400">No items sold in this date range.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {itemReportData.map((item, i) => (
                    <ItemReportRow key={i} item={item} activeView={activeView} router={router} />
                  ))}
                </div>
              )}
            </div>
            
            {!isItemReportLoading && itemReportData.length > 0 && (
              <div className="bg-slate-900 text-white p-4 text-center text-xs font-bold tracking-widest uppercase print:hidden">
                Showing {itemReportData.length} Unique Products
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

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
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} width={120} tickFormatter={v => v.length > 18 ? v.substring(0, 17) + "…" : v} />
                <Tooltip formatter={(v: unknown) => [v != null ? `${v} units` : "—", "Qty"]} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11 }} />
                <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                  {products.slice(0, 5).map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-100">
                <tr><th className="text-left py-2 text-slate-400 font-bold">#</th><th className="text-left py-2 text-slate-400 font-bold">Product</th><th className="text-right py-2 text-slate-400 font-bold">Qty</th><th className="text-right py-2 text-slate-400 font-bold">Revenue</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {products.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-1.5 pr-2"><span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ background: COLORS[i % COLORS.length] }}>{i + 1}</span></td>
                    <td className="py-1.5"><p className="font-semibold text-slate-700 leading-tight">{p.name}</p><p className="text-slate-400 font-mono text-[10px]">{p.sku}</p></td>
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

function ItemReportRow({ item, activeView, router }: { item: ItemReportEntry, activeView: string, router: any }) {
  const [showAll, setShowAll] = useState(false)
  const displayMemos = showAll ? item.memos : item.memos.slice(0, 10)
  const hiddenCount = item.memos.length - 10
  
  return (
    <div className="p-5 hover:bg-slate-50/50 transition-colors print:break-inside-avoid">
       <div className="flex justify-between items-start mb-3">
          <div>
            <h4 className="font-bold text-slate-800 text-base">{item.name}</h4>
            <p className="text-xs font-mono text-slate-400 mt-0.5">{item.sku}</p>
          </div>
          <div className="text-right shrink-0 ml-4">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-0.5">Total Sold</p>
            <p className="text-2xl font-black text-indigo-600">{item.total_qty}</p>
          </div>
       </div>
       
       <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
            <Receipt className="w-3 h-3"/> Found in {item.memos.length} Memos:
          </span>
          {displayMemos.map(m => (
            <button 
              key={m.id}
              onClick={() => router.push(activeView === "Orders" ? `/orders/${m.id}` : `/cash-memo/${m.id}`)}
              className="text-[11px] font-bold font-mono bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors print:border-none print:px-1 print:py-0"
            >
              {m.num}
            </button>
          ))}
          
          {!showAll && hiddenCount > 0 && (
            <button 
              onClick={() => setShowAll(true)}
              className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded hover:bg-indigo-100 transition-colors print:hidden"
            >
              + {hiddenCount} more...
            </button>
          )}
          {showAll && hiddenCount > 0 && (
            <button 
              onClick={() => setShowAll(false)}
              className="text-[11px] font-black text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded hover:bg-slate-200 transition-colors print:hidden"
            >
              Show less
            </button>
          )}
       </div>
    </div>
  )
}