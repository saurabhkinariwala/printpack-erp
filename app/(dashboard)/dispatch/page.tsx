"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Truck, Package, Search, Calendar, ArrowUpRight, X, RefreshCw, MapPin, Hash, Clock, User, Box, ClipboardList, ChevronDown, AlertTriangle, CheckCircle, AlertCircle, Printer, Info } from "lucide-react"

type DispatchItem = { id: string; quantity_dispatched: number; items: { name: string; sku: string; pack_size: number } | null; locations?: { name: string } | null }
type DispatchNote = {
  id: string; dispatch_number: string; note_number: string | null; dispatched_at: string; transporter_name: string | null; transport_reference: string | null; tracking_info: string | null; order_id: string;
  orders: { order_number: string; transport_mode: string | null; transport_details: string | null; customers: { name: string; city: string | null; mobile: string | null } | null } | null;
  dispatch_items: DispatchItem[]
}

type OrderLine = { order_id: string; order_number: string; customer_name: string; order_date: string; pending_qty: number }
type PickItem = {
  item_id: string; name: string; sku: string; pack_size: number; total_pending: number; orders: OrderLine[];
  stock: { location_id: string; location_name: string; qty: number }[];
  totalACT: number; totalAVL: number; status: "full" | "partial" | "none"
}

function fmtDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) }
function fmtTime(d: string) { return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }

export default function DispatchPage() {
  const router = useRouter()
  const supabase = createClient()
  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]

  const [activeTab, setActiveTab] = useState<"register" | "picklist">("register")
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [search, setSearch] = useState("")
  const [notes, setNotes] = useState<DispatchNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [pickItems, setPickItems] = useState<PickItem[]>([])
  const [isPickLoading, setIsPickLoading] = useState(false)
  const [pickView, setPickView] = useState<"item" | "order">("item")
  const [expandedPickId, setExpandedPickId] = useState<string | null>(null)
  const [pickSearch, setPickSearch] = useState("")

  const fetchNotes = useCallback(async () => {
    setIsLoading(true)
    const { data } = await supabase.from("dispatch_notes").select(`
      id, dispatch_number, note_number, dispatched_at, transporter_name, transport_reference, tracking_info, order_id,
      orders(order_number, transport_mode, transport_details, customers(name, city, mobile)),
      dispatch_items(id, quantity_dispatched, items(name, sku, pack_size), locations(name))
    `).gte("dispatched_at", startDate + "T00:00:00").lte("dispatched_at", endDate + "T23:59:59").order("dispatched_at", { ascending: false })
    if (data) setNotes(data as unknown as DispatchNote[])
    setIsLoading(false)
  }, [startDate, endDate, supabase])

  const fetchPickList = useCallback(async () => {
    setIsPickLoading(true)
    const { data: orderItemsData } = await supabase.from("order_items").select(`
      id, item_id, quantity_ordered, items(id, name, sku, pack_size),
      orders!inner(id, order_number, order_date, status, customers(name)), dispatch_items(quantity_dispatched)
    `).neq("orders.status", "Completed").neq("orders.status", "Cancelled").order("orders(order_date)", { ascending: true })

    if (!orderItemsData) { setIsPickLoading(false); return }

    const itemIds = Array.from(new Set(orderItemsData.map((oi: any) => oi.item_id).filter(Boolean)))
    
    let stockData: any[] = []
    if (itemIds.length > 0) {
      for (let i = 0; i < itemIds.length; i += 200) {
        const chunk = itemIds.slice(i, i + 200)
        const { data } = await supabase.from("stock").select(`item_id, quantity, locations(id, name)`).in("item_id", chunk)
        if (data) stockData = stockData.concat(data)
      }
    }

    const { data: allLocations } = await supabase.from("locations").select("id, name")

    const stockMap: Record<string, { location_id: string; location_name: string; qty: number }[]> = {}
    stockData.forEach((s: any) => {
      if (!stockMap[s.item_id]) stockMap[s.item_id] = []
      stockMap[s.item_id].push({ location_id: s.locations?.id || "", location_name: s.locations?.name || "Unknown", qty: s.quantity || 0 })
    })

    const map: Record<string, PickItem> = {}
    orderItemsData.forEach((oi: any) => {
      const item = oi.items; const order = oi.orders;
      if (!item || !order) return
      const alreadyDispatched = oi.dispatch_items?.reduce((s: number, di: any) => s + (di.quantity_dispatched || 0), 0) || 0
      const pendingQty = oi.quantity_ordered - alreadyDispatched
      if (pendingQty <= 0) return

      if (!map[item.id]) {
        if (!stockMap[item.id] && allLocations) {
          stockMap[item.id] = allLocations.map((l: any) => ({ location_id: l.id, location_name: l.name, qty: 0 }))
        }
        const itemStock = stockMap[item.id] || []
        const totalACT = itemStock.reduce((s, l) => s + l.qty, 0)
        
        map[item.id] = {
          item_id: item.id, name: item.name, sku: item.sku, pack_size: item.pack_size || 1, total_pending: 0, orders: [],
          stock: itemStock, totalACT: totalACT, totalAVL: totalACT, status: "none"
        }
      }
      map[item.id].total_pending += pendingQty
      map[item.id].orders.push({ order_id: order.id, order_number: order.order_number, customer_name: order.customers?.name || "Unknown", order_date: order.order_date, pending_qty: pendingQty })
    })

    const items = Object.values(map).map(item => {
      const totalAVL = Math.max(0, item.totalACT - item.total_pending);
      return {
        ...item, totalAVL,
        status: (item.totalACT >= item.total_pending ? "full" : item.totalACT > 0 ? "partial" : "none") as "full" | "partial" | "none"
      }
    })

    items.sort((a, b) => {
      const order = { none: 0, partial: 1, full: 2 }
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      return b.total_pending - a.total_pending
    })

    setPickItems(items)
    setIsPickLoading(false)
  }, [supabase])

  useEffect(() => { fetchNotes() }, [fetchNotes])
  useEffect(() => { if (activeTab === "picklist" && pickItems.length === 0) fetchPickList() }, [activeTab, fetchPickList, pickItems.length])

  const filtered = notes.filter(n => {
    const q = search.toLowerCase()
    if (!q) return true
    const locName = n.dispatch_items?.[0]?.locations?.name || ""
    return n.dispatch_number?.toLowerCase().includes(q) || n.orders?.order_number?.toLowerCase().includes(q) || n.orders?.customers?.name?.toLowerCase().includes(q) || n.transporter_name?.toLowerCase().includes(q) || locName.toLowerCase().includes(q) || false
  })
  const totalDispatched = filtered.reduce((sum, n) => sum + n.dispatch_items.reduce((s, di) => s + di.quantity_dispatched, 0), 0)

  const filteredPick = pickItems.filter(p => {
    const q = pickSearch.toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.orders.some(o => o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q))
  })

  type OrderView = { order_id: string; order_number: string; customer_name: string; order_date: string; items: { name: string; sku: string; pending_qty: number; status: "full"|"partial"|"none" }[] }
  const orderViewMap: Record<string, OrderView> = {}
  filteredPick.forEach(item => {
    item.orders.forEach(o => {
      if (!orderViewMap[o.order_id]) { orderViewMap[o.order_id] = { order_id: o.order_id, order_number: o.order_number, customer_name: o.customer_name, order_date: o.order_date, items: [] } }
      orderViewMap[o.order_id].items.push({ name: item.name, sku: item.sku, pending_qty: o.pending_qty, status: item.status })
    })
  })
  const orderViewList = Object.values(orderViewMap).sort((a, b) => a.order_date.localeCompare(b.order_date))

  const pickSummary = {
    totalItems: filteredPick.length,
    totalQty: filteredPick.reduce((s, i) => s + i.total_pending, 0),
    full: filteredPick.filter(i => i.status === "full").length,
    partial: filteredPick.filter(i => i.status === "partial").length,
    none: filteredPick.filter(i => i.status === "none").length,
  }

  const STATUS_CONFIG = {
    full:    { label: "In Stock",      icon: CheckCircle,  color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
    partial: { label: "Partial Stock", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50",  border: "border-amber-200" },
    none:    { label: "Out of Stock",  icon: AlertCircle,  color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200"   },
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="text-2xl font-bold text-slate-800">Dispatch</h2><p className="text-sm text-slate-500 mt-0.5">Dispatch register · Pending fulfilment pick list</p></div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab("register")} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "register" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><Truck className="h-4 w-4" /> Dispatch Register</button>
        <button onClick={() => setActiveTab("picklist")} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "picklist" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
          <ClipboardList className="h-4 w-4" /> Pending Pick List
          {pickItems.length > 0 && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${pickItems.some(i => i.status === "none") ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{pickItems.filter(i => i.status !== "full").length}</span>}
        </button>
      </div>

      {activeTab === "register" && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium" />
            <span className="text-slate-400 text-sm">to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium" />
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Search dispatch #, order, customer, location…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
              {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <button onClick={fetchNotes} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"><RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /></button>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-2 text-center"><p className="text-xs text-purple-500 font-semibold">Total Notes</p><p className="text-xl font-black text-purple-700">{filtered.length}</p></div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 text-center"><p className="text-xs text-blue-500 font-semibold">Units Dispatched</p><p className="text-xl font-black text-blue-700">{totalDispatched.toLocaleString()}</p></div>
          </div>
          {isLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-400 text-sm">Loading dispatch notes...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-16 flex flex-col items-center text-center"><Truck className="h-12 w-12 text-slate-200 mb-4" /><h3 className="font-bold text-slate-500">No dispatch notes found</h3><p className="text-sm text-slate-400 mt-1">Dispatch notes are created from order detail pages</p></div>
          ) : (
            <div className="space-y-3">
              {filtered.map(note => {
                const isExpanded = expandedId === note.id
                const totalQty = note.dispatch_items.reduce((s, di) => s + di.quantity_dispatched, 0)
                const totalBundles = note.dispatch_items.reduce((s, di) => s + Math.ceil(di.quantity_dispatched / (di.items?.pack_size || 1)), 0)
                return (
                  <div key={note.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : note.id)}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0"><Truck className="h-5 w-5 text-purple-600" /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap"><span className="font-black text-slate-800">{note.dispatch_number}</span>{note.note_number && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">#{note.note_number}</span>}</div>
                          <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(note.dispatched_at)} {fmtTime(note.dispatched_at)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col sm:items-center gap-1 sm:w-52">
                        <button onClick={e => { e.stopPropagation(); router.push(`/orders/${note.order_id}`) }} className="font-bold text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"><Hash className="h-3.5 w-3.5" />{note.orders?.order_number || "—"}<ArrowUpRight className="h-3 w-3" /></button>
                        <span className="text-xs text-slate-600 flex items-center gap-1"><User className="h-3 w-3 text-slate-400" />{note.orders?.customers?.name || "—"}</span>
                      </div>
                      <div className="flex items-center gap-3 sm:ml-auto">
                        <div className="text-right hidden md:block"><p className="text-[10px] text-slate-400 font-semibold uppercase">Location</p><p className="text-sm font-bold text-slate-700">{note.dispatch_items?.[0]?.locations?.name || "—"}</p></div>
                        <div className="text-right hidden sm:block"><p className="text-[10px] text-slate-400 font-semibold uppercase">Delivery Mode</p><p className="text-sm font-bold text-slate-700">{note.transporter_name || "Self Pickup"}</p></div>
                        <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-center shrink-0"><p className="text-[10px] text-purple-500 font-bold uppercase">Units</p><p className="text-xl font-black text-purple-700">{totalQty}</p></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center shrink-0"><p className="text-[10px] text-slate-400 font-bold uppercase">Bundles</p><p className="text-xl font-black text-slate-700">{totalBundles}</p></div>
                        <ChevronDownIcon rotated={isExpanded} />
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50">
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 px-4 py-3 border-b border-slate-100 text-xs">
                          <div><p className="text-slate-400 font-bold uppercase mb-0.5">Location</p><p className="font-semibold text-slate-700">{note.dispatch_items?.[0]?.locations?.name || "—"}</p></div>
                          <div><p className="text-slate-400 font-bold uppercase mb-0.5">Transport Mode</p><p className="font-semibold text-slate-700">{note.orders?.transport_mode || "—"}</p></div>
                          <div><p className="text-slate-400 font-bold uppercase mb-0.5">Transporter</p><p className="font-semibold text-slate-700">{note.transporter_name || "—"}</p></div>
                          <div><p className="text-slate-400 font-bold uppercase mb-0.5">Reference</p><p className="font-mono text-slate-700">{note.transport_reference || "—"}</p></div>
                          <div><p className="text-slate-400 font-bold uppercase mb-0.5">Tracking</p><p className="font-mono text-blue-600">{note.tracking_info || "—"}</p></div>
                        </div>
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-3"><Box className="h-4 w-4 text-purple-500" /><h4 className="text-sm font-bold text-slate-700">Items Dispatched</h4></div>
                          <table className="w-full text-xs">
                            <thead><tr className="border-b border-slate-200"><th className="text-left py-2 font-bold text-slate-500 uppercase">Product</th><th className="text-left py-2 font-bold text-slate-500 uppercase">SKU</th><th className="text-center py-2 font-bold text-slate-500 uppercase">Pack</th><th className="text-right py-2 font-bold text-slate-500 uppercase">Qty</th><th className="text-right py-2 font-bold text-purple-600 uppercase">Bundles</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {note.dispatch_items.map(di => {
                                const pack = di.items?.pack_size || 1; const bundles = Math.ceil(di.quantity_dispatched / pack)
                                return (
                                  <tr key={di.id} className="hover:bg-white"><td className="py-2.5 font-semibold text-slate-700">{di.items?.name || "Unknown"}</td><td className="py-2.5 font-mono text-slate-400">{di.items?.sku || "—"}</td><td className="py-2.5 text-center"><span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{pack}</span></td><td className="py-2.5 text-right font-bold text-slate-700">{di.quantity_dispatched}</td><td className="py-2.5 text-right"><span className="font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{bundles}</span></td></tr>
                                )
                              })}
                            </tbody>
                            <tfoot className="border-t border-slate-200"><tr><td colSpan={3} className="py-2 text-right font-bold text-slate-500 text-[10px] uppercase tracking-wide">Total</td><td className="py-2 text-right font-black text-purple-800">{totalQty}</td><td className="py-2 text-right font-black text-purple-700">{totalBundles}</td></tr></tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 2: PENDING PICK LIST
      ════════════════════════════════════════════════════════════ */}
      {activeTab === "picklist" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Search item, SKU, order number, customer…" value={pickSearch} onChange={e => setPickSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white" />
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setPickView("item")} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${pickView === "item" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>By Item</button>
              <button onClick={() => setPickView("order")} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${pickView === "order" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>By Order</button>
            </div>
            <button onClick={() => { setPickItems([]); fetchPickList() }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"><RefreshCw className={`h-3.5 w-3.5 ${isPickLoading ? "animate-spin" : ""}`} /> Refresh</button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"><Printer className="h-3.5 w-3.5" /> Print</button>
          </div>

          {!isPickLoading && pickItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Pending Items",   value: pickSummary.totalItems, color: "text-slate-800",  bg: "bg-white",     border: "border-slate-200" },
                { label: "Total Units Due", value: pickSummary.totalQty,   color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200"  },
                { label: "Can Fulfil",      value: pickSummary.full,       color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
                { label: "Stock Issues",    value: pickSummary.partial + pickSummary.none, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
              ].map(c => (
                <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 text-center shadow-sm`}><p className="text-xs text-slate-500 font-semibold">{c.label}</p><p className={`text-2xl font-black mt-1 ${c.color}`}>{c.value.toLocaleString()}</p></div>
              ))}
            </div>
          )}

          {isPickLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-400 text-sm">Building pick list…</div>
          ) : filteredPick.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-16 flex flex-col items-center text-center"><ClipboardList className="h-12 w-12 text-slate-200 mb-4" /><h3 className="font-bold text-slate-500">No pending items</h3><p className="text-sm text-slate-400 mt-1">All orders are fully dispatched</p></div>
          ) : pickView === "item" ? (
            <div className="space-y-3">
              {filteredPick.map(item => {
                const cfg = STATUS_CONFIG[item.status]
                const StatusIcon = cfg.icon
                const isExpanded = expandedPickId === item.item_id
                const bundles = Math.ceil(item.total_pending / item.pack_size)
                return (
                  <div key={item.item_id} className={`bg-white rounded-xl border shadow-sm overflow-visible ${cfg.border}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpandedPickId(isExpanded ? null : item.item_id)}>
                      <div className={`h-10 w-10 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}><StatusIcon className={`h-5 w-5 ${cfg.color}`} /></div>
                      <div className="flex-1 min-w-0"><p className="font-bold text-slate-800">{item.name}</p><p className="text-xs text-slate-400 font-mono mt-0.5">{item.sku} · Pack {item.pack_size}</p></div>
                      
                      {/* THE NEW STOCK HOVER REVEAL */}
                      <div className="relative group/stock cursor-help bg-slate-50 border border-slate-200 rounded-lg p-2 mx-auto w-36">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="text-slate-500 flex items-center gap-1 font-bold">ACT: {item.totalACT} <Info className="w-2.5 h-2.5 text-slate-400" /></span>
                          <span className={`font-black ${item.totalAVL > 0 ? "text-green-600" : "text-red-500"}`}>AVL: {item.totalAVL}</span>
                        </div>
                        <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-48 bg-slate-800 text-white rounded-lg p-2.5 opacity-0 invisible group-hover/stock:opacity-100 group-hover/stock:visible transition-all duration-200 z-20 shadow-xl border border-slate-700 pointer-events-none">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-600 pb-1 mb-1">Department Breakdown</p>
                          {item.stock.map(loc => (
                            <div key={loc.location_name} className="flex justify-between text-[10px] py-1 border-b border-slate-700 last:border-0 font-mono">
                              <span className="font-medium text-slate-300 truncate pr-2">{loc.location_name}</span>
                              <span className="shrink-0 text-slate-400 font-bold">{loc.qty}</span>
                            </div>
                          ))}
                          {item.stock.length === 0 && <div className="text-[10px] text-slate-400 py-1 italic text-center">No stock recorded</div>}
                          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 rotate-45 border-t border-l border-slate-700"></div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-center"><p className="text-[10px] text-slate-400 font-bold uppercase">Pending</p><p className="text-lg font-black text-slate-800">{item.total_pending}</p></div>
                        <div className="text-center"><p className="text-[10px] text-slate-400 font-bold uppercase">Bundles</p><p className="text-lg font-black text-purple-700">{bundles}</p></div>
                        <ChevronDownIcon rotated={isExpanded} />
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 p-4">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Needed by {item.orders.length} order{item.orders.length !== 1 ? "s" : ""}</p>
                        <div className="space-y-2">
                          {item.orders.map(o => (
                            <div key={o.order_id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                              <div className="flex items-center gap-3">
                                <button onClick={() => router.push(`/orders/${o.order_id}`)} className="font-bold text-blue-600 hover:underline text-sm flex items-center gap-1">{o.order_number} <ArrowUpRight className="h-3 w-3" /></button>
                                <span className="text-xs text-slate-500">{o.customer_name}</span><span className="text-xs text-slate-400 font-mono">{fmtDate(o.order_date)}</span>
                              </div>
                              <div className="flex items-center gap-3"><span className="text-sm font-black text-slate-800">{o.pending_qty} units</span><span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">{Math.ceil(o.pending_qty / item.pack_size)} bundle{Math.ceil(o.pending_qty / item.pack_size) !== 1 ? "s" : ""}</span></div>
                            </div>
                          ))}
                        </div>
                        {item.status !== "full" && (
                          <div className={`mt-3 p-3 rounded-lg border ${cfg.bg} ${cfg.border} flex items-center gap-2`}><AlertTriangle className={`h-4 w-4 ${cfg.color} shrink-0`} /><p className={`text-xs font-semibold ${cfg.color}`}>{item.status === "none" ? `No stock available. Need ${item.total_pending} units to fulfil all orders.` : `Only ${item.totalACT} units actual stock. Short by ${item.total_pending - item.totalACT} units.`}</p></div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {orderViewList.map(order => {
                const isExpanded = expandedPickId === order.order_id
                const hasIssue = order.items.some(i => i.status !== "full")
                const totalPending = order.items.reduce((s, i) => s + i.pending_qty, 0)
                return (
                  <div key={order.order_id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${hasIssue ? "border-amber-200" : "border-green-200"}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpandedPickId(isExpanded ? null : order.order_id)}>
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${hasIssue ? "bg-amber-50" : "bg-green-50"}`}>{hasIssue ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle className="h-5 w-5 text-green-600" />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2"><button onClick={e => { e.stopPropagation(); router.push(`/orders/${order.order_id}`) }} className="font-bold text-blue-600 hover:underline text-sm flex items-center gap-1">{order.order_number} <ArrowUpRight className="h-3 w-3" /></button><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${hasIssue ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>{hasIssue ? "Stock Issue" : "Ready to Dispatch"}</span></div>
                        <p className="text-xs text-slate-500 mt-0.5">{order.customer_name} · {fmtDate(order.order_date)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-center"><p className="text-[10px] text-slate-400 font-bold uppercase">Line Items</p><p className="text-lg font-black text-slate-800">{order.items.length}</p></div>
                        <div className="text-center"><p className="text-[10px] text-slate-400 font-bold uppercase">Pending Units</p><p className="text-lg font-black text-slate-800">{totalPending}</p></div>
                        <ChevronDownIcon rotated={isExpanded} />
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 p-4">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-slate-200"><th className="text-left py-2 font-bold text-slate-500 uppercase">Product</th><th className="text-right py-2 font-bold text-slate-500 uppercase">Pending</th><th className="text-center py-2 font-bold text-slate-500 uppercase">Stock Status</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {order.items.map((i, idx) => {
                              const cfg = STATUS_CONFIG[i.status]
                              const SIcon = cfg.icon
                              return (
                                <tr key={idx} className="hover:bg-white"><td className="py-2.5 font-semibold text-slate-700">{i.name}<span className="text-slate-400 font-mono ml-2 text-[10px]">{i.sku}</span></td><td className="py-2.5 text-right font-black text-slate-800">{i.pending_qty}</td><td className="py-2.5 text-center"><span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border`}><SIcon className="h-3 w-3" /> {cfg.label}</span></td></tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ChevronDownIcon({ rotated }: { rotated: boolean }) { return <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-all shrink-0 ${rotated ? "bg-slate-200 rotate-180" : "bg-slate-100 hover:bg-slate-200"}`}><ChevronDown className="h-4 w-4 text-slate-500" /></div> }