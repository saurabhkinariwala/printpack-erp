"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search, Plus, X, Loader2, MapPin, Package, Filter, Save, History } from "lucide-react"
import { usePermissions } from "@/hooks/usePermissions"
import Link from "next/link"

type Location = { id: string; name: string; type: string }
type StockRow = {
  item_id: string; name: string; sku: string; pack_size: number
  category: string; sub_category: string; sub_sub_category: string
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
  const [locationFilter, setLocationFilter] = useState<string>("All")  // ← new
  const [categories, setCategories] = useState<string[]>([])

  // Manufacture modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mfrItem, setMfrItem] = useState<StockRow | null>(null)
  const [mfrQtys, setMfrQtys] = useState<Record<string, string>>({})
  const [mfrNote, setMfrNote] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    const { data: locData } = await supabase.from("locations").select("id, name, type").order("name")

    // Query from items so items with no stock row still appear.
    // stock is a left-join — Supabase returns stock as [] if no rows exist.
    const { data: itemsData } = await supabase.from("items").select(`
      id, name, sku, pack_size,
      sub_categories(name, categories(name)),
      sub_sub_categories(name),
      stock(location_id, quantity)
    `).order("name")

    if (!locData || !itemsData) { setIsLoading(false); return }
    setLocations(locData)

    const map: Record<string, StockRow> = {}
    itemsData.forEach((item: any) => {
      const catName    = item.sub_categories?.categories?.name || "Other"
      const subCatName = item.sub_categories?.name || ""
      const sscName    = item.sub_sub_categories?.name || ""

      const stockByLoc: Record<string, number> = {}
      let total = 0
      ;(item.stock || []).forEach((s: any) => {
        stockByLoc[s.location_id] = s.quantity || 0
        total += s.quantity || 0
      })

      map[item.id] = {
        item_id: item.id, name: item.name, sku: item.sku,
        pack_size: item.pack_size || 10,
        category: catName, sub_category: subCatName, sub_sub_category: sscName,
        stock: stockByLoc, total
      }
    })

    const allRows = Object.values(map)
      .filter(r => isCategoryAllowed(r.category))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

    setRows(allRows)
    setCategories(["All", ...Array.from(new Set(allRows.map(r => r.category))).sort()])
    setIsLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Manufacture modal ─────────────────────────────────────────────────────
  const openManufacture = (row: StockRow) => {
    setMfrItem(row)
    const init: Record<string, string> = {}
    locations.forEach(l => { init[l.id] = "" })
    setMfrQtys(init)
    setMfrNote("")
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!mfrItem) return
    const entries = Object.entries(mfrQtys).filter(([, v]) => Number(v) > 0)
    if (entries.length === 0) return alert("Enter qty for at least one location.")
    setIsSaving(true)

    for (const [locationId, qtyStr] of entries) {
      const qty = Number(qtyStr)
      const existing = mfrItem.stock[locationId] || 0
      const { error: stockErr } = await supabase.from("stock").upsert(
        { item_id: mfrItem.item_id, location_id: locationId, quantity: existing + qty },
        { onConflict: "item_id, location_id" }
      )
      if (stockErr) { alert("Stock update failed: " + stockErr.message); setIsSaving(false); return }
      await supabase.from("stock_ledger").insert({
        item_id: mfrItem.item_id, to_location_id: locationId,
        quantity: qty, transaction_type: "manufacture", reference_id: null,
      })
    }

    await fetchData()
    setIsModalOpen(false)
    setIsSaving(false)
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  // When a specific location is selected, only keep rows that have stock > 0 there
  const selectedLocId = locationFilter === "All"
    ? null
    : locations.find(l => l.id === locationFilter)?.id ?? null

  const filtered = rows.filter(r => {
    const matchesCat = categoryFilter === "All" || r.category === categoryFilter
    const q = search.toLowerCase()
    const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
    // Location filter: only show items that have stock at selected location
    const matchesLoc = !selectedLocId || (r.stock[selectedLocId] || 0) > 0
    return matchesCat && matchesSearch && matchesLoc
  })

  // ── Grouping: category → sub_category → sub_sub_category ─────────────────
  type L3 = Record<string, StockRow[]>
  type L2 = Record<string, L3>
  type L1 = Record<string, L2>

  const grouped: L1 = {}
  filtered.forEach(r => {
    const cat = r.category
    const sub = r.sub_category || "General"
    const ssc = r.sub_sub_category || ""    // empty string = no sub_sub level
    if (!grouped[cat]) grouped[cat] = {}
    if (!grouped[cat][sub]) grouped[cat][sub] = {}
    if (!grouped[cat][sub][ssc]) grouped[cat][sub][ssc] = []
    grouped[cat][sub][ssc].push(r)
  })

  // ── Location summary totals ───────────────────────────────────────────────
  const locationTotals: Record<string, number> = {}
  rows.forEach(r => {     // always use ALL rows for summary cards, not filtered
    locations.forEach(l => {
      locationTotals[l.id] = (locationTotals[l.id] || 0) + (r.stock[l.id] || 0)
    })
  })

  // Columns to show in the table
  // When a location is selected → show only that column + Total
  // When All → show all location columns + Total
  const visibleLocations = selectedLocId
    ? locations.filter(l => l.id === selectedLocId)
    : locations

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Inventory</h2>
          <p className="text-sm text-slate-500 mt-0.5">Live stock across all locations · Add manufactured stock</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/inventory/ledger" className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-lg text-sm font-bold shadow-sm transition-colors">
            <History className="h-4 w-4" /> View Item Ledger
          </Link>
          <button onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm">
            <Package className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* ── Location tabs (summary cards that also act as filters) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

        {/* All locations card */}
        <button
          onClick={() => setLocationFilter("All")}
          className={`rounded-xl border p-4 text-center transition-all shadow-sm ${
            locationFilter === "All"
              ? "bg-slate-900 border-slate-900 text-white shadow-md"
              : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
          }`}
        >
          <p className={`text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-1 mb-1 ${locationFilter === "All" ? "text-slate-400" : "text-slate-400"}`}>
            <MapPin className="h-3 w-3" /> All Locations
          </p>
          <p className={`font-bold text-sm leading-tight ${locationFilter === "All" ? "text-white" : "text-slate-700"}`}>Combined</p>
          <p className={`text-2xl font-black mt-1 ${locationFilter === "All" ? "text-blue-300" : "text-blue-600"}`}>
            {Object.values(locationTotals).reduce((a, b) => a + b, 0).toLocaleString()}
          </p>
          <p className={`text-[10px] mt-0.5 ${locationFilter === "All" ? "text-slate-400" : "text-slate-400"}`}>total units</p>
        </button>

        {/* Per-location cards */}
        {locations.map(loc => {
          const isActive = locationFilter === loc.id
          return (
            <button
              key={loc.id}
              onClick={() => setLocationFilter(isActive ? "All" : loc.id)}
              className={`rounded-xl border p-4 text-center transition-all shadow-sm ${
                isActive
                  ? "bg-slate-900 border-slate-900 shadow-md"
                  : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-md"
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-1 mb-1 ${isActive ? "text-slate-400" : "text-slate-400"}`}>
                <MapPin className="h-3 w-3" />{loc.type}
              </p>
              <p className={`font-bold text-sm leading-tight ${isActive ? "text-white" : "text-slate-700"}`}>{loc.name}</p>
              <p className={`text-2xl font-black mt-1 ${isActive ? "text-blue-300" : "text-blue-600"}`}>
                {(locationTotals[loc.id] || 0).toLocaleString()}
              </p>
              <p className={`text-[10px] mt-0.5 ${isActive ? "text-slate-400" : "text-slate-400"}`}>units in stock</p>
            </button>
          )
        })}
      </div>

      {/* Active location banner */}
      {selectedLocId && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-bold text-blue-800">
              Showing stock at: {locations.find(l => l.id === selectedLocId)?.name}
            </span>
            <span className="text-xs text-blue-500 font-semibold">
              · {filtered.length} item{filtered.length !== 1 ? "s" : ""} in stock here
            </span>
          </div>
          <button
            onClick={() => setLocationFilter("All")}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> Clear filter
          </button>
        </div>
      )}

      {/* ── Category + Search filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search product or SKU…"
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
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
                }`}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-400 text-sm">Loading inventory…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-16 text-center text-slate-400 text-sm">
          {selectedLocId
            ? `No items with stock at ${locations.find(l => l.id === selectedLocId)?.name}`
            : "No items match your filter"}
        </div>
      ) : (
        Object.entries(grouped).map(([catName, subGroups]) => (
          <div key={catName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Category header */}
            <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider">{catName}</h3>
              <span className="text-xs text-slate-400">
                {Object.values(subGroups).flatMap(s => Object.values(s)).flat().length} items
              </span>
            </div>

            {Object.entries(subGroups).map(([subCatName, sscGroups]) => (
              <div key={subCatName}>

                {/* Sub-category header */}
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{subCatName}</span>
                  <span className="text-[10px] text-slate-400">
                    {Object.values(sscGroups).flat().length} products
                  </span>
                </div>

                {Object.entries(sscGroups).map(([sscName, items]) => (
                  <div key={sscName}>

                    {/* Sub-sub-category header (only shown if it exists) */}
                    {sscName && (
                      <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-2">
                        <div className="w-1 h-4 bg-blue-400 rounded-full" />
                        <span className="text-xs font-semibold text-blue-700">{sscName}</span>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b border-slate-100 bg-white">
                          <tr>
                            <th className="text-left px-5 py-2.5 font-bold text-slate-500 uppercase min-w-[220px]">Product</th>
                            {visibleLocations.map(l => (
                              <th key={l.id} className="text-right px-4 py-2.5 font-bold text-slate-500 uppercase whitespace-nowrap min-w-[110px]">
                                {l.name}
                              </th>
                            ))}
                            {/* Show Total column only in "All" mode */}
                            {!selectedLocId && (
                              <th className="text-right px-4 py-2.5 font-bold text-blue-600 uppercase whitespace-nowrap">Total</th>
                            )}
                            <th className="px-4 py-2.5 text-center font-bold text-slate-500 uppercase whitespace-nowrap">+ Stock</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {items.map(row => {
                            const locQty = selectedLocId ? (row.stock[selectedLocId] || 0) : null
                            return (
                              <tr key={row.item_id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-3">
                                  <p className="font-semibold text-slate-800 leading-tight">{row.name}</p>
                                  <p className="text-slate-400 font-mono text-[10px] mt-0.5">
                                    {row.sku} · Pack {row.pack_size}
                                  </p>
                                </td>

                                {visibleLocations.map(l => {
                                  const qty = row.stock[l.id] || 0
                                  return (
                                    <td key={l.id} className="px-4 py-3 text-right">
                                      <span className={`font-bold text-sm ${
                                        qty === 0 ? "text-red-400" :
                                        qty < 50  ? "text-amber-600" : "text-slate-700"
                                      }`}>
                                        {qty}
                                      </span>
                                    </td>
                                  )
                                })}

                                {/* Total (all-locations mode only) */}
                                {!selectedLocId && (
                                  <td className="px-4 py-3 text-right font-black text-blue-600">{row.total}</td>
                                )}

                                <td className="px-4 py-3 text-center">
                                  <button onClick={() => openManufacture(row)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg font-bold text-[10px] transition-colors mx-auto">
                                    <Plus className="h-3 w-3" /> Add
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>

                        {/* Sub-totals footer row per table */}
                        <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                          <tr>
                            <td className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                              Subtotal · {items.length} items
                            </td>
                            {visibleLocations.map(l => (
                              <td key={l.id} className="px-4 py-2 text-right font-black text-slate-600">
                                {items.reduce((s, r) => s + (r.stock[l.id] || 0), 0).toLocaleString()}
                              </td>
                            ))}
                            {!selectedLocId && (
                              <td className="px-4 py-2 text-right font-black text-blue-700">
                                {items.reduce((s, r) => s + r.total, 0).toLocaleString()}
                              </td>
                            )}
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ))}
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
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 font-semibold">Enter quantity produced at each location:</p>
              {locations.map(loc => (
                <div key={loc.id} className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-700 text-sm">{loc.name}</p>
                    <p className="text-[10px] text-slate-400">
                      Current: <span className="font-bold text-slate-600">{mfrItem.stock[loc.id] || 0}</span>
                      {Number(mfrQtys[loc.id]) > 0 && (
                        <span className="text-green-600 font-bold ml-1">
                          → {(mfrItem.stock[loc.id] || 0) + Number(mfrQtys[loc.id])}
                        </span>
                      )}
                    </p>
                  </div>
                  <input type="number" min="0"
                    value={mfrQtys[loc.id] || ""}
                    onChange={e => setMfrQtys({ ...mfrQtys, [loc.id]: e.target.value })}
                    placeholder="0"
                    className="w-24 p-2 border border-slate-300 rounded-lg outline-none focus:border-green-500 text-right font-bold text-green-700 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Note (optional)</label>
                <input type="text" value={mfrNote} onChange={e => setMfrNote(e.target.value)}
                  placeholder="e.g. Batch #42 production run"
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-green-500 text-sm" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSave} disabled={isSaving}
                className="flex-[2] py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
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