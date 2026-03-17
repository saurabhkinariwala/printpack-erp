"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search, Plus, X, Loader2, MapPin, Package, Filter, ChevronDown, ChevronRight, Save } from "lucide-react"
import { usePermissions } from "@/hooks/usePermissions"

type Location = { id: string; name: string; type: string }
type StockRow = {
  item_id: string; name: string; sku: string; pack_size: number
  category: string; sub_category: string
  stock: Record<string, number>   // location_id → quantity
  total: number
}

export default function InventoryPage() {
  const supabase = createClient()
  const { isCategoryAllowed } = usePermissions()

  const [locations, setLocations] = useState<Location[]>([])
  const [rows, setRows] = useState<StockRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("All")
  const [categories, setCategories] = useState<string[]>([])

  // Manufacture modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mfrItem, setMfrItem] = useState<StockRow | null>(null)
  const [mfrQtys, setMfrQtys] = useState<Record<string, string>>({})   // location_id → qty string
  const [mfrNote, setMfrNote] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    const { data: locData } = await supabase.from("locations").select("id, name, type").order("name")
    const { data: stockData } = await supabase.from("stock").select(`
      item_id, location_id, quantity,
      items(name, sku, pack_size, sub_categories(name, categories(name)))
    `)

    if (!locData || !stockData) { setIsLoading(false); return }
    setLocations(locData)

    // Build flat rows keyed by item_id
    const map: Record<string, StockRow> = {}
    stockData.forEach((s: any) => {
      const item = s.items
      if (!item) return
      const catName = item.sub_categories?.categories?.name || "Other"
      const subCatName = item.sub_categories?.name || ""
      if (!map[s.item_id]) {
        map[s.item_id] = {
          item_id: s.item_id, name: item.name, sku: item.sku,
          pack_size: item.pack_size || 10,
          category: catName, sub_category: subCatName,
          stock: {}, total: 0
        }
      }
      map[s.item_id].stock[s.location_id] = s.quantity
      map[s.item_id].total += s.quantity
    })

    const allRows = Object.values(map)
      .filter(r => isCategoryAllowed(r.category))   // ← permission gate
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setRows(allRows)
    setCategories(["All", ...Array.from(new Set(allRows.map(r => r.category))).sort()])
    setIsLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Open manufacture modal ──
  const openManufacture = (row: StockRow) => {
    setMfrItem(row)
    // Pre-fill with 0 for every location
    const init: Record<string, string> = {}
    locations.forEach(l => { init[l.id] = "" })
    setMfrQtys(init)
    setMfrNote("")
    setIsModalOpen(true)
  }

  // ── Save manufacture: upsert stock + insert stock_ledger entries ──
  const handleSave = async () => {
    if (!mfrItem) return
    const entries = Object.entries(mfrQtys).filter(([, v]) => Number(v) > 0)
    if (entries.length === 0) return alert("Enter qty for at least one location.")
    setIsSaving(true)

    for (const [locationId, qtyStr] of entries) {
      const qty = Number(qtyStr)

      // Upsert stock (add to existing)
      const existing = mfrItem.stock[locationId] || 0
      const { error: stockErr } = await supabase.from("stock").upsert(
        { item_id: mfrItem.item_id, location_id: locationId, quantity: existing + qty },
        { onConflict: "item_id, location_id" }
      )
      if (stockErr) { alert("Stock update failed: " + stockErr.message); setIsSaving(false); return }

      // Record in stock_ledger
      await supabase.from("stock_ledger").insert({
        item_id: mfrItem.item_id,
        to_location_id: locationId,
        quantity: qty,
        transaction_type: "manufacture",
        reference_id: null,
      })
    }

    await fetchData()
    setIsModalOpen(false)
    setIsSaving(false)
  }

  // ── Filtering ──
  const filtered = rows.filter(r => {
    const matchesCat = categoryFilter === "All" || r.category === categoryFilter
    const q = search.toLowerCase()
    const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
    return matchesCat && matchesSearch
  })

  // Group by category → sub_category
  const grouped: Record<string, Record<string, StockRow[]>> = {}
  filtered.forEach(r => {
    if (!grouped[r.category]) grouped[r.category] = {}
    if (!grouped[r.category][r.sub_category]) grouped[r.category][r.sub_category] = []
    grouped[r.category][r.sub_category].push(r)
  })

  // Summary totals per location
  const locationTotals: Record<string, number> = {}
  filtered.forEach(r => {
    locations.forEach(l => {
      locationTotals[l.id] = (locationTotals[l.id] || 0) + (r.stock[l.id] || 0)
    })
  })

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Inventory</h2>
          <p className="text-sm text-slate-500 mt-0.5">Live stock across all locations · Add manufactured stock</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <Package className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* ── Location Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {locations.map(loc => (
          <div key={loc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-center gap-1 mb-1">
              <MapPin className="h-3 w-3" />{loc.type}
            </p>
            <p className="font-bold text-slate-700 text-sm leading-tight">{loc.name}</p>
            <p className="text-2xl font-black text-blue-600 mt-1">{(locationTotals[loc.id] || 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">units in stock</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search product or SKU…"
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <div className="flex gap-1 flex-wrap">
            {categories.map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                  categoryFilter === c
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-400 text-sm">Loading inventory…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-16 text-center text-slate-400 text-sm">No items match your filter</div>
      ) : (
        Object.entries(grouped).map(([catName, subGroups]) => (
          <div key={catName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider">{catName}</h3>
              <span className="text-xs text-slate-400">{Object.values(subGroups).flat().length} items</span>
            </div>

            {Object.entries(subGroups).map(([subCatName, items]) => (
              <div key={subCatName}>
                {subCatName && (
                  <div className="bg-slate-50 border-b border-slate-100 px-5 py-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{subCatName}</span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-100">
                      <tr>
                        <th className="text-left px-5 py-2.5 font-bold text-slate-500 uppercase min-w-[200px]">Product</th>
                        {locations.map(l => (
                          <th key={l.id} className="text-right px-4 py-2.5 font-bold text-slate-500 uppercase whitespace-nowrap min-w-[100px]">
                            {l.name}
                          </th>
                        ))}
                        <th className="text-right px-4 py-2.5 font-bold text-blue-600 uppercase whitespace-nowrap">Total</th>
                        <th className="px-4 py-2.5 text-center font-bold text-slate-500 uppercase whitespace-nowrap">+ Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map(row => (
                        <tr key={row.item_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-800 leading-tight">{row.name}</p>
                            <p className="text-slate-400 font-mono text-[10px] mt-0.5">{row.sku} · Pack {row.pack_size}</p>
                          </td>
                          {locations.map(l => {
                            const qty = row.stock[l.id] || 0
                            return (
                              <td key={l.id} className="px-4 py-3 text-right">
                                <span className={`font-bold ${qty === 0 ? "text-red-400" : qty < 50 ? "text-amber-600" : "text-slate-700"}`}>
                                  {qty}
                                </span>
                              </td>
                            )
                          })}
                          <td className="px-4 py-3 text-right font-black text-blue-600">{row.total}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => openManufacture(row)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg font-bold text-[10px] transition-colors mx-auto"
                            >
                              <Plus className="h-3 w-3" /> Add
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {/* ── Manufacture Modal ── */}
      {isModalOpen && mfrItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">

            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-green-50">
              <div>
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-green-600" /> Add Manufactured Stock
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{mfrItem.name} · <span className="font-mono">{mfrItem.sku}</span></p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 font-semibold">Enter quantity produced at each location:</p>

              {locations.map(loc => (
                <div key={loc.id} className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-700 text-sm">{loc.name}</p>
                    <p className="text-[10px] text-slate-400">Current stock: <span className="font-bold text-slate-600">{mfrItem.stock[loc.id] || 0}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0"
                      value={mfrQtys[loc.id] || ""}
                      onChange={e => setMfrQtys({ ...mfrQtys, [loc.id]: e.target.value })}
                      placeholder="0"
                      className="w-24 p-2 border border-slate-300 rounded-lg outline-none focus:border-green-500 text-right font-bold text-green-700 text-sm"
                    />
                    <span className="text-xs text-slate-400 w-8">
                      → {(mfrItem.stock[loc.id] || 0) + (Number(mfrQtys[loc.id]) || 0)}
                    </span>
                  </div>
                </div>
              ))}

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Note (optional)</label>
                <input
                  type="text" value={mfrNote} onChange={e => setMfrNote(e.target.value)}
                  placeholder="e.g. Batch #42 production run"
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-green-500 text-sm"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={handleSave} disabled={isSaving} className="flex-[2] py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Saving…" : "Add to Stock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}