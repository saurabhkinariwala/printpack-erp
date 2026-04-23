"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Search, Plus, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Trash2, LayoutGrid, List as ListIcon, Calendar, RefreshCw, X, PackageOpen } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

// ⚡ UPDATED: Added cash_memo_items to the type
type CashMemo = {
  id: string;
  memo_number: string;
  memo_date: string;
  customer_name: string | null;
  customer_mobile: string | null;
  total_amount: number;
  discount_value: number;
  is_gst_applied: boolean;
  created_at: string;
  payments: { amount: number; payment_date: string }[];
  cash_memo_items: { quantity: number; items: { name: string } | null }[];
};

type SortConfig = { key: 'memo_number' | 'memo_date' | 'customer_name' | 'total_amount' | 'payment'; direction: 'asc' | 'desc' };

export default function CashMemosList() {
  const [memos, setMemos] = useState<CashMemo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'memo_number', direction: 'desc' })
  
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)

  // ⚡ NEW: State to control the Quick View Modal
  const [quickViewMemo, setQuickViewMemo] = useState<CashMemo | null>(null)

  const { hasPermission } = useAuth()
  const supabase = createClient()

  const fetchMemos = useCallback(async () => {
    setIsLoading(true);
    // ⚡ UPDATED: Added cash_memo_items(quantity, items(name)) to the fetch query
    const { data } = await supabase
      .from('cash_memos')
      .select(`
        id, memo_number, memo_date, customer_name, customer_mobile, total_amount, discount_value, is_gst_applied, created_at,
        payments (amount, payment_date),
        cash_memo_items (quantity, items (name))
      `)
      .gte('memo_date', startDate)
      .lte('memo_date', endDate)
      .order('created_at', { ascending: false }); 

    if (data) setMemos(data as unknown as CashMemo[]);
    setIsLoading(false);
  }, [startDate, endDate, supabase]);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

  const handleDelete = async (id: string, memoNumber: string) => {
    if (!window.confirm(`Are you absolutely sure you want to cancel/delete ${memoNumber}? This will refund the items back to Office stock.`)) return;

    const { error } = await supabase.rpc('delete_cash_memo_safely', { p_memo_id: id });
    
    if (error) {
      alert("Failed to delete memo: " + error.message);
    } else {
      setMemos(memos.filter(m => m.id !== id));
    }
  }

  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const SortIcon = ({ columnKey }: { columnKey: SortConfig['key'] }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 inline-block" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 ml-1 inline-block" /> : <ArrowDown className="w-3 h-3 text-blue-600 ml-1 inline-block" />;
  };

  const getPaymentBadge = (totalAmount: number, payments: { amount: number; payment_date: string }[]) => {
    const totalPaid = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

    let percent = 0;
    if (totalAmount > 0) percent = Math.round((totalPaid / totalAmount) * 100);
    else if (totalPaid > 0) percent = 100;

    if (percent === 0) {
      return <span className="whitespace-nowrap px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-200 shadow-sm">0% Paid</span>;
    }
    if (percent >= 100) {
      return <span className="whitespace-nowrap px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-green-200 shadow-sm">100% Paid</span>;
    }

    return (
      <span className="whitespace-nowrap px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-yellow-300 shadow-sm flex flex-col items-center leading-tight">
        <span>{percent}% Paid</span>
        <span>Bal: ₹{(totalAmount - totalPaid).toLocaleString()}</span>
      </span>
    );
  }

  let filteredMemos = memos.filter(m =>
    m.memo_number.toLowerCase().includes(search.toLowerCase()) ||
    (m.customer_name && m.customer_name.toLowerCase().includes(search.toLowerCase())) ||
    (m.customer_mobile && m.customer_mobile.includes(search))
  );

  filteredMemos.sort((a, b) => {
    let aValue: any = a[sortConfig.key as keyof CashMemo];
    let bValue: any = b[sortConfig.key as keyof CashMemo];

    if (sortConfig.key === 'memo_number') {
      aValue = parseInt(a.memo_number.replace(/\D/g, '') || '0', 10);
      bValue = parseInt(b.memo_number.replace(/\D/g, '') || '0', 10);
    }

    if (sortConfig.key === 'customer_name') {
      aValue = a.customer_name || "";
      bValue = b.customer_name || "";
    }
    
    if (sortConfig.key === 'payment') {
      const aPaid = a.payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const bPaid = b.payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      aValue = a.total_amount > 0 ? aPaid / a.total_amount : 0;
      bValue = b.total_amount > 0 ? bPaid / b.total_amount : 0;
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20 relative">

      {/* ── Header Area ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Cash Memos</h2>
          <p className="text-sm text-slate-500">View, sort, and manage counter sales.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 self-start md:self-auto">
            <button 
              onClick={() => setViewMode('list')} 
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="List View"
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('grid')} 
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <Link href="/cash-memo/new" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow font-bold flex items-center justify-center gap-2 shrink-0 transition-colors">
            <Plus className="w-5 h-5" /> New Memo
          </Link>
        </div>
      </div>

      {/* ── Filters & Search Area ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Search Memo No, Name, or Mobile..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-full md:w-auto">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none text-sm outline-none font-medium text-slate-700 w-full md:w-auto" />
            <span className="text-slate-400 text-sm font-semibold">to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none text-sm outline-none font-medium text-slate-700 w-full md:w-auto" />
          </div>
          <button onClick={fetchMemos} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors border border-slate-200">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Data Display Area ── */}
      {isLoading ? (
        <div className="py-24 text-center text-slate-500 font-medium bg-white rounded-xl border border-slate-200 border-dashed">
          Loading cash memos...
        </div>
      ) : filteredMemos.length === 0 ? (
        <div className="py-24 text-center text-slate-500 font-medium bg-white rounded-xl border border-slate-200 border-dashed">
          No cash memos found matching your criteria.
        </div>
      ) : viewMode === 'list' ? (
        
        // ⚡ LIST VIEW
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500 font-bold select-none tracking-wider">
                <tr>
                  <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('memo_number')}>Memo No <SortIcon columnKey="memo_number" /></th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('memo_date')}>Date <SortIcon columnKey="memo_date" /></th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('customer_name')}>Customer Details <SortIcon columnKey="customer_name" /></th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors text-center" onClick={() => handleSort('payment')}>Payment Status <SortIcon columnKey="payment" /></th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors text-right" onClick={() => handleSort('total_amount')}>Total Amount <SortIcon columnKey="total_amount" /></th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMemos.map((memo) => (
                  <tr key={memo.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-black text-slate-800">{memo.memo_number}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{new Date(memo.memo_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-sm">{memo.customer_name || 'Walk-in Customer'}</div>
                      {memo.customer_mobile && (
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500 font-mono">
                          {memo.customer_mobile}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">{getPaymentBadge(memo.total_amount, memo.payments)}</td>
                    <td className="px-6 py-4 text-right font-black text-slate-800 text-base">₹{memo.total_amount.toLocaleString()}</td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link href={`/cash-memo/${memo.id}`} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 rounded shadow-sm transition-all" title="View Cash Memo">
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        {hasPermission('edit_cash_memos') && (
                          <Link href={`/cash-memo/${memo.id}/edit`} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-green-600 hover:border-green-300 hover:bg-green-50 rounded shadow-sm transition-all" title="Edit Cash Memo">
                            <Edit2 className="w-4 h-4" />
                          </Link>
                        )}
                        {hasPermission('delete_cash_memos') && (
                          <button onClick={() => handleDelete(memo.id, memo.memo_number)} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-red-600 hover:border-red-300 hover:bg-red-50 rounded shadow-sm transition-all" title="Delete Cash Memo">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (

        // ⚡ GRID VIEW
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredMemos.map((memo) => {
            const itemCount = memo.cash_memo_items?.length || 0;
            const previewItems = memo.cash_memo_items?.slice(0, 3) || [];
            
            return (
              <div key={memo.id} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden relative">
                
                {/* Header Strip */}
                <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
                  <span className="font-black text-slate-800 text-lg">{memo.memo_number}</span>
                  <span className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                    {new Date(memo.memo_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                
                <div className="p-4 flex-1 flex flex-col gap-3">
                  {/* Customer Details */}
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm truncate">{memo.customer_name || 'Walk-in Customer'}</h4>
                    {memo.customer_mobile && <p className="text-xs font-mono text-slate-500 mt-0.5">{memo.customer_mobile}</p>}
                  </div>
                  
                  {/* ⚡ NEW: Items Preview Box */}
                  <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-xs flex flex-col gap-1.5 mt-1">
                    <div className="flex justify-between items-center border-b border-blue-100/50 pb-1 mb-1">
                      <span className="font-bold text-blue-800 flex items-center gap-1.5">
                        <PackageOpen className="w-3.5 h-3.5"/> Items ({itemCount})
                      </span>
                      {itemCount > 3 && (
                        <button 
                          onClick={() => setQuickViewMemo(memo)}
                          className="text-blue-600 font-bold hover:text-blue-800 transition-colors"
                        >
                          Open
                        </button>
                      )}
                    </div>
                    
                    <ul className="text-slate-600 font-medium space-y-1">
                      {previewItems.map((cmi, idx) => (
                        <li key={idx} className="truncate">
                          <span className="font-black text-slate-700 mr-1.5">{cmi.quantity}x</span> 
                          {cmi.items?.name || 'Unknown Item'}
                        </li>
                      ))}
                    </ul>
                    
                    {itemCount > 3 && (
                      <p className="text-slate-400 italic mt-0.5 font-medium">+ {itemCount - 3} more items...</p>
                    )}
                  </div>
                  
                  {/* Financials (Pushed to bottom) */}
                  <div className="mt-auto pt-2">
                    <div className="flex items-end justify-between mb-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</p>
                      <p className="text-2xl font-black text-slate-800">₹{memo.total_amount.toLocaleString()}</p>
                    </div>
                    <div className="flex justify-start">
                      {getPaymentBadge(memo.total_amount, memo.payments)}
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                  <Link href={`/cash-memo/${memo.id}`} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 rounded shadow-sm transition-all" title="View Cash Memo">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                  {hasPermission('edit_cash_memos') && (
                    <Link href={`/cash-memo/${memo.id}/edit`} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-green-600 hover:border-green-300 hover:bg-green-50 rounded shadow-sm transition-all" title="Edit Cash Memo">
                      <Edit2 className="w-4 h-4" />
                    </Link>
                  )}
                  {hasPermission('delete_cash_memos') && (
                    <button onClick={() => handleDelete(memo.id, memo.memo_number)} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-red-600 hover:border-red-300 hover:bg-red-50 rounded shadow-sm transition-all" title="Delete Cash Memo">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ⚡ NEW: Quick View Modal for Items */}
      {quickViewMemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50 shrink-0">
              <div>
                <h3 className="font-black text-slate-800 text-lg">Items Included</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{quickViewMemo.memo_number}</p>
              </div>
              <button 
                onClick={() => setQuickViewMemo(null)}
                className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            <div className="p-2 flex-1 overflow-y-auto">
              <ul className="divide-y divide-slate-50">
                {quickViewMemo.cash_memo_items?.map((item, i) => (
                  <li key={i} className="py-3 px-4 flex justify-between items-center hover:bg-slate-50 rounded-lg transition-colors">
                    <span className="font-semibold text-slate-700 text-sm pr-4">{item.items?.name || 'Unknown Item'}</span>
                    <span className="font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-md shrink-0">
                      {item.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-center shrink-0">
               <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                 Total Items: {quickViewMemo.cash_memo_items?.length}
               </p>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}