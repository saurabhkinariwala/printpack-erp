"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search, Calendar, MapPin, Download, Package, ArrowRight, Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from 'next/navigation'

type Location = { id: string; name: string }
type Item = { id: string; name: string; sku: string }
type LedgerEntry = {
  id: string;
  transaction_date: string;
  created_at: string;
  transaction_type: string;
  quantity: number;
  notes: string | null;          
  vehicle_number: string | null;
  from_location_id: string | null;
  to_location_id: string | null;
  from_loc?: { name: string } | null;
  to_loc?: { name: string } | null; 
  qtyIn: number;
  qtyOut: number;
  runningBalance: number;
}

export default function ItemLedgerPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [isLoading, setIsLoading] = useState(true)
  const [isFetchingData, setIsFetchingData] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  
  // ⚡ NEW: State to hold the Customer Name mapping
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({})
  
  const [search, setSearch] = useState("")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<string>("All")
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  })
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [openingBalance, setOpeningBalance] = useState(0)
  const [closingBalance, setClosingBalance] = useState(0)
  const [totalIn, setTotalIn] = useState(0)
  const [totalOut, setTotalOut] = useState(0)

  useEffect(() => {
    async function fetchInitialData() {
      // Fetch Locations
      const { data: locData } = await supabase.from('locations').select('id, name').order('name');
      if (locData) setLocations(locData);

      // ⚡ NEW: Fetch Cash Memos to build the Customer Dictionary
      const { data: cmData } = await supabase.from('cash_memos').select('memo_number, customer_name');
      if (cmData) {
        const map: Record<string, string> = {};
        cmData.forEach(cm => {
          if (cm.customer_name && cm.customer_name.trim() !== "") {
            map[cm.memo_number] = cm.customer_name;
          }
        });
        setCustomerMap(map);
      }

      // Fetch Items
      const { data: itemData } = await supabase.from('items').select('id, name, sku').order('name');
      if (itemData) {
        setItems(itemData);
        const urlItemId = searchParams.get('itemId');
        if (urlItemId) {
          const preselected = itemData.find(item => item.id === urlItemId);
          if (preselected) {
            setSelectedItem(preselected);
            setSearch(`${preselected.name} (${preselected.sku})`); 
          }
        }
      }
      setIsLoading(false);
    }
    fetchInitialData();

    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setIsDropdownOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [supabase, searchParams])

  // ── THE FINANCIAL ENGINE: Calculate Opening Balance & Ledger ──
  useEffect(() => {
    if (!selectedItem) return;

    async function generateLedger() {
      setIsFetchingData(true);

      const { data: absoluteStockData } = await supabase
        .from('stock')
        .select('location_id, quantity')
        .eq('item_id', selectedItem?.id);

      let absoluteTotal = 0;
      if (absoluteStockData) {
        if (selectedLocation === "All") {
          absoluteTotal = absoluteStockData.reduce((sum, s) => sum + s.quantity, 0);
        } else {
          const locStock = absoluteStockData.find(s => s.location_id === selectedLocation);
          absoluteTotal = locStock ? locStock.quantity : 0;
        }
      }
      setClosingBalance(absoluteTotal);

      const { data: pastData } = await supabase
        .from('stock_ledger')
        .select('quantity, transaction_type, from_location_id, to_location_id')
        .eq('item_id', selectedItem?.id)
        .lt('transaction_date', startDate + "T00:00:00");

      let openBal = 0;
      if (pastData) {
        pastData.forEach(row => {
          if (selectedLocation === "All") {
            if (row.to_location_id && !row.from_location_id) openBal += row.quantity; 
            else if (row.from_location_id && !row.to_location_id) openBal -= row.quantity; 
            else if (row.transaction_type?.toLowerCase() === 'sale') openBal -= row.quantity;
            else if (row.transaction_type?.toLowerCase() === 'refund') openBal += row.quantity;
          } else {
            if (row.to_location_id === selectedLocation) openBal += row.quantity;
            if (row.from_location_id === selectedLocation) openBal -= row.quantity;
          }
        });
      }
      setOpeningBalance(openBal);

      const { data: currentData } = await supabase
        .from('stock_ledger')
        .select(`
          id, transaction_date, created_at, transaction_type, quantity, notes, vehicle_number, from_location_id, to_location_id,
          from_loc:locations!from_location_id(name),
          to_loc:locations!to_location_id(name)
        `)
        .eq('item_id', selectedItem?.id)
        .gte('transaction_date', startDate + "T00:00:00")
        .lte('transaction_date', endDate + "T23:59:59")
        .order('transaction_date', { ascending: true });

      let runningBal = openBal;
      let tIn = 0;
      let tOut = 0;

      const processedEntries: LedgerEntry[] = [];

      if (currentData) {
        currentData.forEach(row => {
          let qIn = 0;
          let qOut = 0;

          if (selectedLocation === "All") {
            if (row.to_location_id && !row.from_location_id) qIn = row.quantity; 
            else if (row.from_location_id && !row.to_location_id) qOut = row.quantity; 
            else if (row.transaction_type?.toLowerCase() === 'sale') qOut = row.quantity;
            else if (row.transaction_type?.toLowerCase() === 'refund') qIn = row.quantity;
            else if (row.transaction_type?.toLowerCase() === 'transfer') { qIn = 0; qOut = 0; }
          } else {
            if (row.to_location_id === selectedLocation) qIn = row.quantity;
            if (row.from_location_id === selectedLocation) qOut = row.quantity;
          }

          if (qIn === 0 && qOut === 0 && row.transaction_type?.toLowerCase() !== 'transfer') return;
          if (selectedLocation !== "All" && qIn === 0 && qOut === 0) return;

          runningBal += qIn;
          runningBal -= qOut;
          tIn += qIn;
          tOut += qOut;

          processedEntries.push({
            id: row.id,
            transaction_date: row.transaction_date, 
            created_at: row.created_at,
            transaction_type: row.transaction_type,
            quantity: row.quantity,
            notes: row.notes,
            vehicle_number: row.vehicle_number,
            from_location_id: row.from_location_id,
            to_location_id: row.to_location_id,
            from_loc: (Array.isArray(row.from_loc) ? row.from_loc[0] : row.from_loc) as { name: string } | null,
            to_loc: (Array.isArray(row.to_loc) ? row.to_loc[0] : row.to_loc) as { name: string } | null,
            qtyIn: qIn,
            qtyOut: qOut,
            runningBalance: runningBal
          });
        });
      }

      setEntries(processedEntries.reverse());
      setTotalIn(tIn);
      setTotalOut(tOut);
      setIsFetchingData(false);
    }

    generateLedger();
  }, [selectedItem, selectedLocation, startDate, endDate, supabase]);


  // ── Excel Export ──
  const handleExportExcel = () => {
    if (!selectedItem) return alert("Please select an item first.");

    const headers = ["Date", "Transaction Type", "Route", "Vehicle / Notes", "Qty IN (+)", "Qty OUT (-)", "Running Balance"];
    
    const csvData = [
      [`"${startDate}"`, `"OPENING BALANCE"`, `""`, `""`, `""`, `""`, openingBalance].join(",")
    ];

    [...entries].reverse().forEach(e => {
      const route = e.from_loc || e.to_loc ? `${e.from_loc?.name || 'External'} -> ${e.to_loc?.name || 'External'}` : e.transaction_type;
      
      // ⚡ FORMAT NOTES FOR EXCEL: Inject the customer name if it exists!
      let finalNotes = [e.vehicle_number, e.notes].filter(Boolean).join(" | ");
      const cmMatch = e.notes?.match(/(CM-\d+)/);
      if (cmMatch && customerMap[cmMatch[1]]) {
        finalNotes = `${finalNotes} [${customerMap[cmMatch[1]]}]`;
      }

      const displayDate = e.transaction_date || e.created_at;

      csvData.push([
        `"${new Date(displayDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}"`,
        `"${e.transaction_type}"`,
        `"${route}"`,
        `"${finalNotes.replace(/"/g, '""')}"`,
        e.qtyIn || "",
        e.qtyOut || "",
        e.runningBalance
      ].join(","));
    });

    csvData.push([`"${endDate}"`, `"CLOSING BALANCE"`, `""`, `""`, totalIn, totalOut, closingBalance].join(","));

    const csvString = [headers.join(","), ...csvData].join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Ledger_${selectedItem.sku}_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.sku.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 15);

  if (isLoading) return <div className="p-20 text-center text-slate-500 font-bold"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div>;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-6 h-6 text-purple-600"/> Item Ledger (Bin Card)
          </h2>
          <p className="text-sm text-slate-500 mt-1">Track the complete audit trail and stock movement for any product.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/inventory" className="p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-600 transition-colors">
            <ArrowLeft className="w-5 h-5"/>
          </Link>
          <button onClick={handleExportExcel} disabled={!selectedItem} className="bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white px-5 py-2.5 rounded-lg shadow font-bold flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* ── Filters Card ── */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-2 relative" ref={searchRef}>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Product *</label>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <Search className="w-4 h-4 text-slate-400"/>
              <input 
                type="text" 
                placeholder="Search product by name or SKU..." 
                value={search} 
                onChange={e => { setSearch(e.target.value); setIsDropdownOpen(true); }} 
                onFocus={() => setIsDropdownOpen(true)} 
                className="w-full bg-transparent outline-none text-sm font-bold text-slate-800"
              />
            </div>
            {isDropdownOpen && search.length > 0 && (
              <ul className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                {filteredItems.length === 0 ? <li className="p-4 text-sm text-slate-500 text-center font-medium">No products found.</li> : (
                  filteredItems.map(item => (
                    <li key={item.id} className="border-b border-slate-50 last:border-0">
                      <button onClick={() => { setSelectedItem(item); setSearch(`${item.name} (${item.sku})`); setIsDropdownOpen(false); }} className="w-full flex items-center justify-between p-3 hover:bg-blue-50 transition-colors text-left group">
                        <div className="flex flex-col"><span className="text-sm font-bold text-slate-800">{item.name}</span><span className="text-[10px] text-slate-400 font-mono mt-0.5">{item.sku}</span></div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block flex items-center gap-1"><MapPin className="w-3 h-3"/> Location Filter</label>
            <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-sm font-bold text-slate-700 shadow-sm">
              <option value="All">All Company Locations</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block flex items-center gap-1"><Calendar className="w-3 h-3"/> Date Range</label>
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-xs font-bold text-slate-700 shadow-sm" />
              <span className="text-slate-400 font-bold text-xs">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-xs font-bold text-slate-700 shadow-sm" />
            </div>
          </div>
        </div>
      </div>

      {selectedItem ? (
        <div className="space-y-6">
          {/* ── Summary Strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800 text-white rounded-xl p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Opening Balance</p>
              <p className="text-3xl font-black">{openingBalance}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total IN (+)</p>
              <p className="text-2xl font-black text-green-600">{totalIn}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total OUT (-)</p>
              <p className="text-2xl font-black text-red-600">{totalOut}</p>
            </div>
            <div className="bg-purple-600 text-white rounded-xl p-5 shadow-sm text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-200 mb-1">Closing Balance</p>
              <p className="text-3xl font-black">{closingBalance}</p>
            </div>
          </div>

          {/* ── Ledger Table ── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
               <h3 className="font-bold text-slate-800 text-sm">Transaction History</h3>
               {isFetchingData && <Loader2 className="w-4 h-4 animate-spin text-blue-500"/>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Date & Time</th>
                    <th className="py-3 px-5">Type</th>
                    <th className="py-3 px-5">Route / Details</th>
                    <th className="py-3 px-5 text-center text-green-600 bg-green-50/50">IN (+)</th>
                    <th className="py-3 px-5 text-center text-red-600 bg-red-50/50">OUT (-)</th>
                    <th className="py-3 px-5 text-right font-black text-slate-800 bg-slate-50">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.length === 0 ? (
                    <tr><td colSpan={6} className="py-16 text-center text-slate-400 font-medium">No transactions found for this date range.</td></tr>
                  ) : (
                    entries.map((entry) => {
                      const displayDate = entry.transaction_date || entry.created_at;
                      
                      // ⚡ UI RENDER: Extract CM number and check our map
                      const cmMatch = entry.notes?.match(/(CM-\d+)/);
                      const customerName = cmMatch ? customerMap[cmMatch[1]] : null;

                      return (
                        <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-5 whitespace-nowrap">
                            <p className="font-semibold text-slate-800">{new Date(displayDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{new Date(displayDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                          </td>
                          <td className="py-3 px-5">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                              entry.transaction_type?.toLowerCase() === 'sale' ? 'bg-red-100 text-red-700' :
                              entry.transaction_type?.toLowerCase() === 'manufacture' ? 'bg-green-100 text-green-700' :
                              entry.transaction_type?.toLowerCase() === 'transfer' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {entry.transaction_type}
                            </span>
                          </td>
                          <td className="py-3 px-5">
                            {(entry.from_loc || entry.to_loc) && (
                               <div className="flex items-center gap-1.5 text-xs mb-1">
                                 <span className="font-semibold text-slate-600">{entry.from_loc?.name || 'External'}</span>
                                 <ArrowRight className="w-3 h-3 text-slate-300"/>
                                 <span className="font-semibold text-slate-800">{entry.to_loc?.name || 'External'}</span>
                               </div>
                            )}
                            {(entry.notes || entry.vehicle_number) && (
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {entry.vehicle_number && <span className="bg-slate-200 text-slate-700 px-1.5 rounded mr-2">{entry.vehicle_number}</span>}
                                {entry.notes}
                                {/* ⚡ UI RENDER: Display the customer name if found */}
                                {customerName && <span className="ml-1.5 text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">[{customerName}]</span>}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-5 text-center font-black text-green-600 bg-green-50/10">
                            {entry.qtyIn > 0 ? `+${entry.qtyIn}` : '-'}
                          </td>
                          <td className="py-3 px-5 text-center font-black text-red-500 bg-red-50/10">
                            {entry.qtyOut > 0 ? `-${entry.qtyOut}` : '-'}
                          </td>
                          <td className="py-3 px-5 text-right font-black text-slate-800 bg-slate-50/50 text-base">
                            {entry.runningBalance}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
          <h3 className="text-lg font-bold text-slate-600">Select a product to view its ledger.</h3>
          <p className="text-sm text-slate-400 mt-1">Search by name or SKU above to load the complete audit trail.</p>
        </div>
      )}
    </div>
  )
}