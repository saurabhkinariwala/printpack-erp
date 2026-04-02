"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Truck, Plus, X, Loader2, Search, Calendar, ArrowRight,
  Package, RefreshCw, ChevronDown, Save, MapPin, Hash
} from "lucide-react"
import { usePermissions } from "@/hooks/usePermissions"

type Location = { id: string; name: string; type: string }
type Item = {
  id: string; name: string; sku: string; pack_size: number
  stock: Record<string, number>   // location_id → qty
}
type TransferLine = { item_id: string; name: string; sku: string; pack_size: number; qty: string; available: number }

type TransferRecord = {
  id: string;
  created_at: string;
  transaction_type: string;
  quantity: number;
  vehicle_number: string | null;
  notes: string | null;
  reference_id?: string | null;
  from_location: { name: string } | null;
  to_location: { name: string } | null;
  items: { name: string; sku: string } | null;
}

export default function TransfersPage() {
  const supabase = createClient()
  const { isCategoryAllowed } = usePermissions()

  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Transfer form
  const [fromLocation, setFromLocation] = useState("")
  const [toLocation, setToLocation] = useState("")
  const [vehicleNumber, setVehicleNumber] = useState("")
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [transferNote, setTransferNote] = useState("")
  const [lines, setLines] = useState<TransferLine[]>([])
  const [itemSearch, setItemSearch] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  // History
  const [history, setHistory] = useState<TransferRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  )
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0])
  const [historySearch, setHistorySearch] = useState("")

  // ── Fetch locations + items with stock ──
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const { data: locData } = await supabase.from("locations").select("id, name, type").order("name")
    const { data: stockData } = await supabase.from("stock").select(`
      item_id, location_id, quantity,
      items(id, name, sku, pack_size, sub_categories(name, categories(name)))
    `)

    if (!locData) { setIsLoading(false); return }
    setLocations(locData)

    if (stockData) {
      const map: Record<string, Item> = {}
      stockData.forEach((s: any) => {
        if (!s.items) return
        // ← permission gate: skip items from categories the employee can't access
        const topCat = s.items.sub_categories?.categories?.name
        if (!isCategoryAllowed(topCat)) return
        if (!map[s.item_id]) {
          map[s.item_id] = { id: s.item_id, name: s.items.name, sku: s.items.sku, pack_size: s.items.pack_size || 10, stock: {} }
        }
        map[s.item_id].stock[s.location_id] = s.quantity
      })
      setItems(Object.values(map).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))
    }
    setIsLoading(false)
  }, [supabase])

  // ── Fetch transfer history ──
const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    
    const { data, error } = await supabase
      .from("stock_ledger")
      .select(`
        id, created_at, transaction_type, quantity,
        vehicle_number, notes, reference_id,
        from_location:locations!from_location_id(name),
        to_location:locations!to_location_id(name),
        items(name, sku)
      `)
      .eq("transaction_type", "transfer")
      .gte("created_at", startDate + "T00:00:00")
      .lte("created_at", endDate + "T23:59:59")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Database Join Error:", error.message)
    } else if (data) {
      setHistory(data as unknown as TransferRecord[])
    }
    
    setHistoryLoading(false)
  }, [startDate, endDate, supabase])

  useEffect(() => { fetchData(); fetchHistory() }, [fetchData, fetchHistory])

  // ── Add item line ──
  const addLine = (item: Item) => {
    if (lines.find(l => l.item_id === item.id)) return
    const available = fromLocation ? (item.stock[fromLocation] || 0) : 0
    setLines([...lines, { item_id: item.id, name: item.name, sku: item.sku, pack_size: item.pack_size, qty: "", available }])
    setItemSearch("")
  }

  // When fromLocation changes, update available qty on all lines
  const handleFromLocationChange = (locId: string) => {
    setFromLocation(locId)
    setLines(lines.map(l => {
      const item = items.find(i => i.id === l.item_id)
      return { ...l, available: item ? (item.stock[locId] || 0) : 0 }
    }))
  }

  const removeLine = (item_id: string) => setLines(lines.filter(l => l.item_id !== item_id))
  const updateQty = (item_id: string, qty: string) => setLines(lines.map(l => l.item_id === item_id ? { ...l, qty } : l))

  // ── Save transfer ──
  // ── Save transfer ──
  const handleSave = async () => {
    setFormError(null)
    if (!fromLocation) return setFormError("Select a source location.")
    if (!toLocation) return setFormError("Select a destination location.")
    if (fromLocation === toLocation) return setFormError("Source and destination cannot be the same.")
    if (!vehicleNumber.trim()) return setFormError("Vehicle number is required.")
    if (lines.length === 0) return setFormError("Add at least one item.")

    const validLines = lines.filter(l => Number(l.qty) > 0)
    if (validLines.length === 0) return setFormError("Enter a quantity greater than 0 for at least one item.")

    // Check no line exceeds available stock
    for (const l of validLines) {
      if (Number(l.qty) > l.available) {
        return setFormError(`"${l.name}" only has ${l.available} units at source. You entered ${l.qty}.`)
      }
    }

    setIsSaving(true)

    for (const l of validLines) {
      const qty = Number(l.qty)

      // Deduct from source
      const { error: e1 } = await supabase.from("stock").upsert(
        { item_id: l.item_id, location_id: fromLocation, quantity: l.available - qty },
        { onConflict: "item_id, location_id" }
      )
      if (e1) { setFormError("Stock update failed: " + e1.message); setIsSaving(false); return }

      // Add to destination
      const destItem = items.find(i => i.id === l.item_id)
      const destCurrent = destItem?.stock[toLocation] || 0
      const { error: e2 } = await supabase.from("stock").upsert(
        { item_id: l.item_id, location_id: toLocation, quantity: destCurrent + qty },
        { onConflict: "item_id, location_id" }
      )
      if (e2) { setFormError("Stock update failed: " + e2.message); setIsSaving(false); return }

      // Record in ledger (NOW WITH EXPLICIT ERROR CHECKING!)
      const { error: ledgerError } = await supabase.from("stock_ledger").insert({
        item_id: l.item_id,
        from_location_id: fromLocation,
        to_location_id: toLocation,
        quantity: qty,
        transaction_type: "transfer",
        vehicle_number: vehicleNumber.trim().toUpperCase(),
        notes: transferNote.trim() || null,
        created_at: new Date(transferDate).toISOString(),
      })

      if (ledgerError) {
        console.error("Ledger Insert Error:", ledgerError)
        setFormError("History record failed to save: " + ledgerError.message)
        setIsSaving(false)
        return
      }
    }

    await fetchData()
    await fetchHistory()
    setIsModalOpen(false)
    setLines([])
    setVehicleNumber("")
    setTransferNote("")
    setFromLocation("")
    setToLocation("")
    setIsSaving(false)
  }

  const filteredItems = items.filter(item =>
    `${item.name} ${item.sku}`.toLowerCase().includes(itemSearch.toLowerCase()) &&
    !lines.find(l => l.item_id === item.id)
  )

  const filteredHistory = history.filter(h => {
    const q = historySearch.toLowerCase()
    if (!q) return true
    return (
      (h.items as any)?.name?.toLowerCase().includes(q) ||
      (h.items as any)?.sku?.toLowerCase().includes(q) ||
      h.vehicle_number?.toLowerCase().includes(q) ||
      (h.from_location as any)?.name?.toLowerCase().includes(q) ||
      (h.to_location as any)?.name?.toLowerCase().includes(q) || false
    )
  })

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  }

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Stock Transfers</h2>
          <p className="text-sm text-slate-500 mt-0.5">Move stock between Godowns and Head Office · Full vehicle log</p>
        </div>
        <button
          onClick={() => { setIsModalOpen(true); setFormError(null); setLines([]); setVehicleNumber(""); setTransferNote(""); setFromLocation(""); setToLocation("") }}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-md transition-colors"
        >
          <Plus className="h-4 w-4" /> New Transfer
        </button>
      </div>

      {/* ── Location → Location Quick View ── */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {locations.map(loc => (
            <div key={loc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-center gap-1 mb-1">
                <MapPin className="h-3 w-3" />{loc.type}
              </p>
              <p className="font-bold text-slate-700 text-sm">{loc.name}</p>
              <p className="text-xl font-black text-blue-600 mt-1">
                {items.reduce((s, i) => s + (i.stock[loc.id] || 0), 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400">units</p>
            </div>
          ))}
        </div>
      )}

      {/* ── History Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium" />
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value)}
            placeholder="Search product, vehicle, location…"
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
        </div>
        <button onClick={fetchHistory} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Transfer History Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-sm">Stock Ledger</h3>
          <span className="text-xs text-slate-400">{filteredHistory.length} records</span>
        </div>
        {historyLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading history…</div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No ledger records found in this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Reference</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Product</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Route</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Vehicle</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase">Qty</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredHistory.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(h.created_at)}</td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate-700 uppercase tracking-wide">{h.transaction_type}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{h.reference_id || "—"}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-800">{(h.items as any)?.name || "—"}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{(h.items as any)?.sku}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {(h.from_location as any)?.name || "—"}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {(h.to_location as any)?.name || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {h.vehicle_number ? (
                        <span className="font-mono font-bold text-slate-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded text-xs">
                          {h.vehicle_number}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-black text-slate-800">{h.quantity}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{h.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Transfer Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                  <Truck className="h-5 w-5 text-blue-600" /> New Stock Transfer
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Stock is deducted from source and added to destination instantly.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Error */}
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-semibold flex items-start gap-2">
                  <X className="h-4 w-4 shrink-0 mt-0.5 text-red-500" /> {formError}
                </div>
              )}

              {/* Route + Vehicle */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div>
                  <label className="text-[10px] font-bold text-blue-800 uppercase mb-1 block">From Location *</label>
                  <select value={fromLocation} onChange={e => handleFromLocationChange(e.target.value)}
                    className="w-full p-2.5 border border-blue-200 rounded-lg outline-none focus:border-blue-500 bg-white text-sm font-semibold">
                    <option value="">Select…</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-800 uppercase mb-1 block">To Location *</label>
                  <select value={toLocation} onChange={e => setToLocation(e.target.value)}
                    className="w-full p-2.5 border border-blue-200 rounded-lg outline-none focus:border-blue-500 bg-white text-sm font-semibold">
                    <option value="">Select…</option>
                    {locations.filter(l => l.id !== fromLocation).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-800 uppercase mb-1 block flex items-center gap-1">
                    <Hash className="h-3 w-3" /> Vehicle Number *
                  </label>
                  <input type="text" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="MH12AB1234"
                    className="w-full p-2.5 border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-mono font-bold text-sm uppercase" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Transfer Date</label>
                  <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Notes (optional)</label>
                  <input type="text" value={transferNote} onChange={e => setTransferNote(e.target.value)}
                    placeholder="e.g. Diwali stock shift"
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
                </div>
              </div>

              {/* Item Search */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Add Items to Transfer</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                    placeholder="Search product name or SKU…"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
                </div>
                {itemSearch && (
                  <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-lg max-h-48 overflow-y-auto">
                    {filteredItems.length === 0 ? (
                      <p className="p-3 text-sm text-slate-400 text-center">No items found</p>
                    ) : filteredItems.slice(0, 10).map(item => (
                      <button key={item.id} onClick={() => addLine(item)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-slate-50 last:border-0">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{item.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{item.sku}</p>
                        </div>
                        {fromLocation && (
                          <span className="text-xs font-bold text-slate-500">
                            Avail: {item.stock[fromLocation] || 0}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Line Items */}
              {lines.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Product</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Available</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Transfer Qty</th>
                        <th className="px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {lines.map(l => (
                        <tr key={l.item_id} className={Number(l.qty) > l.available ? "bg-red-50" : ""}>
                          <td className="px-4 py-2.5">
                            <p className="font-semibold text-slate-800">{l.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{l.sku}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-600">{l.available}</td>
                          <td className="px-4 py-2.5 text-right">
                            <input type="number" min="1" max={l.available}
                              value={l.qty} onChange={e => updateQty(l.item_id, e.target.value)}
                              className={`w-24 p-1.5 border rounded-lg text-right font-bold outline-none focus:ring-2 text-sm ${
                                Number(l.qty) > l.available
                                  ? "border-red-400 text-red-700 focus:ring-red-200"
                                  : "border-slate-300 text-slate-800 focus:ring-blue-200 focus:border-blue-500"
                              }`}
                              placeholder="0"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => removeLine(l.item_id)} className="text-slate-300 hover:text-red-500 transition-colors">
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={handleSave} disabled={isSaving}
                className="flex-[2] py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Saving Transfer…" : "Confirm Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}