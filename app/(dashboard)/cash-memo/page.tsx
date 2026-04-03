"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Search, Plus, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Trash2, Receipt } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

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
};

type SortConfig = { key: 'memo_number' | 'memo_date' | 'customer_name' | 'total_amount' | 'payment'; direction: 'asc' | 'desc' };

export default function CashMemosList() {
  const [memos, setMemos] = useState<CashMemo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'memo_number', direction: 'desc' })

  const { hasPermission } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    fetchMemos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchMemos() {
    setIsLoading(true);
    const { data } = await supabase.from('cash_memos').select(`
      id, memo_number, memo_date, customer_name, customer_mobile, total_amount, discount_value, is_gst_applied, created_at,
      payments (amount, payment_date)
    `).order('memo_number', { ascending: false });

    if (data) setMemos(data as unknown as CashMemo[]);
    setIsLoading(false);
  }

  const handleDelete = async (id: string, memoNumber: string) => {
    if (!window.confirm(`Are you absolutely sure you want to cancel/delete ${memoNumber}? This will refund the items back to Office stock.`)) return;

    // Use our new secure RPC that handles stock refunds automatically
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
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Cash Memos List</h2>
          <p className="text-sm text-slate-500">View, sort, edit, and track payments for all counter sales.</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search Memo No, Name, or Mobile..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <Link href="/cash-memo/new" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow font-bold flex items-center justify-center gap-2 shrink-0 transition-colors">
            <Plus className="w-5 h-5" /> New Cash Memo
          </Link>
        </div>
      </div>

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
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">Loading cash memos...</td></tr>
              ) : filteredMemos.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">No cash memos found matching your search.</td></tr>
              ) : (
                filteredMemos.map((memo) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}