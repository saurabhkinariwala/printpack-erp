"use client"

import React, { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search, Plus, Trash2, Calendar, FileText, ChevronDown, ChevronUp, Loader2, Building2, Pencil, Filter, X, Save, Clock } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

type CatalogItem = { id: string, name: string, sku: string }
type CartItem = CatalogItem & { quantity: number }

export default function InwardsPage() {
  const supabase = createClient()
  
  const { hasPermission } = useAuth()
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isPackArt = process.env.NEXT_PUBLIC_COMPANY_NAME === "PackArt ERP"

  // ── Form States ──
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null) 
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0])
  const [dmNumber, setDmNumber] = useState("")
  const [vendorName, setVendorName] = useState("")
  
  // ── Item Selection States ──
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // ── History & Filter States ──
  const [receipts, setReceipts] = useState<any[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [vendorFilter, setVendorFilter] = useState("All")
  const [dmSearch, setDmSearch] = useState("")

  const fetchData = async () => {
    setIsLoading(true)
    const { data: items } = await supabase.from('items').select('id, name, sku').order('name')
    if (items) setCatalog(items)

    // ⚡ UPDATED: Fetching the creator and updater audit details
    const { data: history } = await supabase
      .from('inward_receipts')
      .select(`
        id, receipt_date, dm_number, vendor_name, created_at, updated_at,
        creator:created_by (full_name),
        updater:updated_by (full_name),
        inward_receipt_items(item_id, quantity, items(name, sku))
      `)
      .order('receipt_date', { ascending: false })
      .order('created_at', { ascending: false })
    
    if (history) setReceipts(history)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setIsDropdownOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  // ── Logic: Filtering ──
  const uniqueVendors = ["All", ...Array.from(new Set(receipts.map(r => r.vendor_name))).sort()]
  
  const filteredReceipts = receipts.filter(r => {
    const matchesDate = (!startDate || r.receipt_date >= startDate) && (!endDate || r.receipt_date <= endDate)
    const matchesVendor = vendorFilter === "All" || r.vendor_name === vendorFilter
    const matchesDm = !dmSearch || r.dm_number.toLowerCase().includes(dmSearch.toLowerCase())
    return matchesDate && matchesVendor && matchesDm
  })

  // ⚡ NEW: Helper to format the hover text for audit trail
  const getAuditTitle = (receipt: any) => {
    const formatDateTime = (dateStr: string) => new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });

    let title = `DM-${receipt.dm_number}\nCreated by: ${receipt.creator?.full_name || 'System'}\nOn: ${formatDateTime(receipt.created_at)}`;
    
    if (receipt.updated_at && receipt.updated_at !== receipt.created_at) {
      title += `\n\nLast Modified by: ${receipt.updater?.full_name || 'System'}\nOn: ${formatDateTime(receipt.updated_at)}`;
    }
    
    return title;
  };

  // ── Logic: Actions ──
  const filteredCatalog = catalog.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.sku.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 8)

  const addToCart = (item: CatalogItem) => {
    if (cart.find(c => c.id === item.id)) {
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      setCart([...cart, { ...item, quantity: 1 }])
    }
    setSearchTerm(""); setIsDropdownOpen(false)
  }

  const openNewModal = () => {
    setEditId(null)
    setCart([])
    setDmNumber("")
    setVendorName("")
    setReceiptDate(new Date().toISOString().split('T')[0])
    setIsModalOpen(true)
  }

  const openEditModal = (e: React.MouseEvent, r: any) => {
    e.stopPropagation() 
    setEditId(r.id)
    setReceiptDate(r.receipt_date)
    setDmNumber(r.dm_number)
    setVendorName(r.vendor_name)
    
    const loadedCart = r.inward_receipt_items.map((i: any) => ({
      id: i.item_id,
      name: i.items.name,
      sku: i.items.sku,
      quantity: i.quantity
    }))
    setCart(loadedCart)
    setIsModalOpen(true)
  }

  const handleDelete = async (e: React.MouseEvent, id: string, dm: string) => {
    e.stopPropagation() 
    if (!window.confirm(`Are you sure you want to delete DM: ${dm}?\n\nThis will permanently reverse the stock items added by this slip.`)) return
    
    setIsLoading(true)
    const { error } = await supabase.rpc('delete_inward_receipt', { p_receipt_id: id })
    if (error) alert("Failed to delete: " + error.message)
    await fetchData()
  }

  const handleSave = async () => {
    if (!vendorName || !dmNumber) return alert("Vendor and DM Number are required.")
    if (cart.length === 0) return alert("Add at least one item.")
    
    setIsSubmitting(true)

    if (editId) {
      const { error: delError } = await supabase.rpc('delete_inward_receipt', { p_receipt_id: editId })
      if (delError) {
        alert("Failed to update existing record."); setIsSubmitting(false); return;
      }
    }

    const payload = {
      header: { receipt_date: receiptDate, dm_number: dmNumber, vendor_name: vendorName },
      items: cart.map(c => ({ id: c.id, quantity: c.quantity }))
    }

    const { error } = await supabase.rpc('process_inward_receipt', { payload })
    
    if (error) {
      alert("Error saving inward slip: " + error.message)
    } else {
      setIsModalOpen(false)
      await fetchData()
    }
    setIsSubmitting(false)
  }

  if (!isPackArt && !isLoading) {
    return <div className="p-20 text-center text-slate-500 font-bold">This page is restricted to Pack Art.</div>
  }

  if (isLoading) return <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500"/></div>

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-20">
      
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><FileText className="w-6 h-6 text-blue-600"/> Inward Slips (GRN)</h2>
          <p className="text-sm text-slate-500 mt-1">Record and manage incoming stock from vendors.</p>
        </div>
        <button onClick={openNewModal} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow font-bold flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New Inward Slip
        </button>
      </div>

      {/* ── Powerful Filters ── */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Filters</span>
        </div>
        
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-slate-400"/>
          <input type="text" placeholder="Search DM Number..." value={dmSearch} onChange={e => setDmSearch(e.target.value)} className="w-full bg-transparent outline-none text-sm font-bold text-slate-700"/>
        </div>

        <div className="min-w-[150px]">
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-sm font-bold text-slate-700">
            <option value="All">All Vendors</option>
            {uniqueVendors.filter(v => v !== "All").map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent outline-none text-xs font-bold text-slate-700 cursor-pointer" title="Start Date" />
          <span className="text-slate-400 text-xs font-bold">to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent outline-none text-xs font-bold text-slate-700 cursor-pointer" title="End Date" />
        </div>
      </div>

      {/* ── Slips Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
            <tr>
              <th className="p-4 w-32">Date</th>
              <th className="p-4">Source / Vendor</th>
              <th className="p-4 w-40">DM Number</th>
              <th className="p-4 w-32 text-center">Total Items</th>
              <th className="p-4 w-28 text-center">Actions</th>
              <th className="p-4 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredReceipts.length === 0 ? (
              <tr><td colSpan={6} className="p-12 text-center text-slate-400">No inward slips found matching your filters.</td></tr>
            ) : (
              filteredReceipts.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    {/* ⚡ UPDATED: Attached the hover tooltip to the table row */}
                    <tr onClick={() => setExpandedId(isExpanded ? null : r.id)} className="hover:bg-slate-50 cursor-pointer transition-colors" title={getAuditTitle(r)}>
                      <td className="p-4">
                        <div className="font-bold text-slate-700">
                          {new Date(r.receipt_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        {/* ⚡ NEW: Time badge for consistency */}
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </div>
                      </td>
                      <td className="p-4 font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400"/> {r.vendor_name}</td>
                      <td className="p-4 font-mono text-slate-600">{r.dm_number}</td>
                      <td className="p-4 text-center">
                        <span className="font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                          {r.inward_receipt_items?.reduce((sum: number, i: any) => sum + i.quantity, 0)} units
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {hasPermission('edit_inwards') && (
                            <button onClick={(e) => openEditModal(e, r)} title="Edit Slip" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                              <Pencil className="w-4 h-4"/>
                            </button>
                          )}
                          {hasPermission('delete_inwards') && (
                            <button onClick={(e) => handleDelete(e, r.id, r.dm_number)} title="Delete Slip" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                              <Trash2 className="w-4 h-4"/>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-slate-400">
                        {isExpanded ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
                      </td>
                    </tr>
                    
                    {/* Expandable Items Drawer */}
                    {isExpanded && (
                      <tr className="bg-slate-50 border-b-2 border-slate-200">
                        <td colSpan={6} className="p-6 pt-4">
                          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden max-w-3xl ml-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100 text-slate-500 uppercase tracking-wider">
                                <tr><th className="p-3 text-left">Product Name</th><th className="p-3 text-left">SKU</th><th className="p-3 text-right">Inward Qty</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {r.inward_receipt_items?.map((item: any, idx: number) => (
                                  <tr key={idx}>
                                    <td className="p-3 font-bold text-slate-700">{item.items.name}</td>
                                    <td className="p-3 font-mono text-slate-500">{item.items.sku}</td>
                                    <td className="p-3 text-right font-black text-green-600">+{item.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── New/Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
              <h2 className="font-bold text-lg text-slate-800">{editId ? "Edit Inward Slip" : "Record Incoming Stock"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Date *</label>
                  <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm font-bold outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Source / Vendor *</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input type="text" placeholder="e.g. Print Pack" value={vendorName} onChange={e => setVendorName(e.target.value)} className="w-full p-2.5 pl-9 border rounded-lg text-sm font-bold outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">DM Number *</label>
                  <input type="text" placeholder="e.g. DM-1042" value={dmNumber} onChange={e => setDmNumber(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm font-mono outline-none focus:border-blue-500" />
                </div>
              </div>

              <hr className="border-slate-100"/>

              <div className="relative" ref={searchRef}>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Add Items</label>
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 focus-within:border-blue-500 transition-colors">
                  <Search className="w-4 h-4 text-blue-500"/>
                  <input type="text" placeholder="Search products..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setIsDropdownOpen(true) }} onFocus={() => setIsDropdownOpen(true)} className="w-full bg-transparent outline-none text-sm font-bold text-blue-900"/>
                </div>
                {isDropdownOpen && searchTerm && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filteredCatalog.map(item => (
                      <li key={item.id}>
                        <button onClick={() => addToCart(item)} className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-100 flex justify-between">
                          <span className="font-bold text-sm text-slate-700">{item.name}</span>
                          <span className="text-xs text-slate-400 font-mono">{item.sku}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase">
                    <tr><th className="p-3">Product</th><th className="p-3 text-center">Qty Received</th><th className="p-3 w-10"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.length === 0 ? <tr><td colSpan={3} className="p-6 text-center text-slate-400">No items added yet.</td></tr> : (
                      cart.map((item) => (
                        <tr key={item.id}>
                          <td className="p-3 font-bold text-slate-700">{item.name}</td>
                          <td className="p-3 text-center"><input type="number" min="1" value={item.quantity} onChange={e => setCart(cart.map(c => c.id === item.id ? { ...c, quantity: parseInt(e.target.value)||1 } : c))} className="w-24 border rounded p-1.5 text-center font-black text-green-700 outline-none focus:border-blue-500"/></td>
                          <td className="p-3"><button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSave} disabled={isSubmitting || cart.length === 0} className="flex-[2] py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} {editId ? "Update Slip" : "Save Inward Slip"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}