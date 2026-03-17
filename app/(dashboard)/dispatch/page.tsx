"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  Truck, Package, Search, Calendar, ArrowUpRight,
  X, RefreshCw, MapPin, Hash, Clock, User, Box
} from "lucide-react"

type DispatchItem = {
  id: string
  quantity_dispatched: number
  items: { name: string; sku: string } | null
}

type DispatchNote = {
  id: string
  dispatch_number: string
  note_number: string | null
  dispatched_at: string
  transporter_name: string | null
  transport_reference: string | null
  tracking_info: string | null
  order_id: string
  orders: {
    order_number: string
    transport_mode: string | null
    transport_details: string | null
    customers: { name: string; city: string | null; mobile: string | null } | null
  } | null
  dispatch_items: DispatchItem[]
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
}

export default function DispatchPage() {
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [search, setSearch] = useState("")
  const [notes, setNotes] = useState<DispatchNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchNotes = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from("dispatch_notes")
      .select(`
        id, dispatch_number, note_number, dispatched_at,
        transporter_name, transport_reference, tracking_info, order_id,
        orders(
          order_number, transport_mode, transport_details,
          customers(name, city, mobile)
        ),
        dispatch_items(
          id, quantity_dispatched,
          items(name, sku)
        )
      `)
      .gte("dispatched_at", startDate + "T00:00:00")
      .lte("dispatched_at", endDate + "T23:59:59")
      .order("dispatched_at", { ascending: false })

    if (!error && data) setNotes(data as unknown as DispatchNote[])
    setIsLoading(false)
  }, [startDate, endDate, supabase])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  const filtered = notes.filter(n => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      n.dispatch_number?.toLowerCase().includes(q) ||
      n.orders?.order_number?.toLowerCase().includes(q) ||
      n.orders?.customers?.name?.toLowerCase().includes(q) ||
      n.transporter_name?.toLowerCase().includes(q) ||
      n.tracking_info?.toLowerCase().includes(q) || false
    )
  })

  const totalDispatched = filtered.reduce((sum, n) =>
    sum + n.dispatch_items.reduce((s, di) => s + di.quantity_dispatched, 0), 0
  )

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dispatch Register</h2>
          <p className="text-sm text-slate-500 mt-0.5">All dispatch notes and delivery records</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-2 text-center">
            <p className="text-xs text-purple-500 font-semibold">Total Notes</p>
            <p className="text-xl font-black text-purple-700">{filtered.length}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 text-center">
            <p className="text-xs text-blue-500 font-semibold">Units Dispatched</p>
            <p className="text-xl font-black text-blue-700">{totalDispatched.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium" />
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Search dispatch #, order, customer, transporter…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button onClick={fetchNotes} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-400 text-sm">
          Loading dispatch notes...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-16 flex flex-col items-center text-center">
          <Truck className="h-12 w-12 text-slate-200 mb-4" />
          <h3 className="font-bold text-slate-500">No dispatch notes found</h3>
          <p className="text-sm text-slate-400 mt-1">Dispatch notes are created from order detail pages</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(note => {
            const isExpanded = expandedId === note.id
            const totalQty = note.dispatch_items.reduce((s, di) => s + di.quantity_dispatched, 0)

            return (
              <div key={note.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition-colors">

                {/* ── Main Row ── */}
                <div
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : note.id)}
                >
                  {/* Left: Dispatch Info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                      <Truck className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800">{note.dispatch_number}</span>
                        {note.note_number && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                            #{note.note_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtDate(note.dispatched_at)} {fmtTime(note.dispatched_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Center: Order + Customer */}
                  <div className="flex flex-col sm:items-center gap-1 sm:w-52">
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/orders/${note.order_id}`) }}
                      className="font-bold text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                    >
                      <Hash className="h-3.5 w-3.5" />
                      {note.orders?.order_number || "—"}
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                    <span className="text-xs text-slate-600 flex items-center gap-1">
                      <User className="h-3 w-3 text-slate-400" />
                      {note.orders?.customers?.name || "—"}
                    </span>
                    {note.orders?.customers?.city && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {note.orders.customers.city}
                      </span>
                    )}
                  </div>

                  {/* Right: Transport + Qty */}
                  <div className="flex items-center gap-4 sm:ml-auto">
                    {note.transporter_name && (
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-slate-400 font-semibold uppercase">Transporter</p>
                        <p className="text-sm font-bold text-slate-700">{note.transporter_name}</p>
                        {note.tracking_info && (
                          <p className="text-[10px] text-blue-500 font-mono mt-0.5 max-w-[140px] truncate">{note.tracking_info}</p>
                        )}
                      </div>
                    )}
                    <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-2 text-center shrink-0">
                      <p className="text-[10px] text-purple-500 font-bold uppercase">Units</p>
                      <p className="text-xl font-black text-purple-700">{totalQty}</p>
                    </div>
                    <button className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${isExpanded ? "bg-slate-200 rotate-180" : "bg-slate-100 hover:bg-slate-200"}`}>
                      <ChevronDownIcon />
                    </button>
                  </div>
                </div>

                {/* ── Expanded: Items Table ── */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    {/* Transport details row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 py-3 border-b border-slate-100 text-xs">
                      <div>
                        <p className="text-slate-400 font-bold uppercase tracking-wide mb-0.5">Transport Mode</p>
                        <p className="font-semibold text-slate-700">{note.orders?.transport_mode || "—"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 font-bold uppercase tracking-wide mb-0.5">Transporter</p>
                        <p className="font-semibold text-slate-700">{note.transporter_name || "—"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 font-bold uppercase tracking-wide mb-0.5">Reference</p>
                        <p className="font-mono text-slate-700">{note.transport_reference || "—"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 font-bold uppercase tracking-wide mb-0.5">Tracking</p>
                        <p className="font-mono text-blue-600">{note.tracking_info || "—"}</p>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Box className="h-4 w-4 text-purple-500" />
                        <h4 className="text-sm font-bold text-slate-700">Items Dispatched</h4>
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                          {note.dispatch_items.length} line{note.dispatch_items.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 font-bold text-slate-500 uppercase">Product</th>
                            <th className="text-left py-2 font-bold text-slate-500 uppercase">SKU</th>
                            <th className="text-right py-2 font-bold text-slate-500 uppercase">Qty Dispatched</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {note.dispatch_items.length === 0 ? (
                            <tr><td colSpan={3} className="py-4 text-center text-slate-400">No items recorded</td></tr>
                          ) : (
                            note.dispatch_items.map(di => (
                              <tr key={di.id} className="hover:bg-white transition-colors">
                                <td className="py-2.5 font-semibold text-slate-700">{di.items?.name || "Unknown"}</td>
                                <td className="py-2.5 font-mono text-slate-400">{di.items?.sku || "—"}</td>
                                <td className="py-2.5 text-right">
                                  <span className="font-black text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full">
                                    {di.quantity_dispatched}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="border-t border-slate-200">
                          <tr>
                            <td colSpan={2} className="py-2 font-bold text-slate-600 text-right uppercase text-[10px] tracking-wide">Total Units</td>
                            <td className="py-2 text-right font-black text-purple-800">{totalQty}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Simple chevron icon to avoid import issues in isolated file
function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}