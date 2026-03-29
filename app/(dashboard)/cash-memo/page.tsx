"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Plus, Receipt, Loader2, Calendar } from "lucide-react"

export default function CashMemosList() {
  const supabase = createClient()
  const [memos, setMemos] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchMemos() {
      const { data } = await supabase
        .from('cash_memos')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) setMemos(data)
      setIsLoading(false)
    }
    fetchMemos()
  }, [supabase])

  if (isLoading) return <div className="p-20 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600"/></div>

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Receipt className="w-6 h-6 text-blue-600"/> Cash Memos</h1>
          <p className="text-sm text-slate-500 font-medium">View and manage all counter sales.</p>
        </div>
        <Link href="/cash-memo/new" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all">
          <Plus className="w-5 h-5"/> New Cash Memo
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-widest text-slate-500">
              <th className="p-4 font-black">Memo #</th>
              <th className="p-4 font-black">Date</th>
              <th className="p-4 font-black">Customer</th>
              <th className="p-4 font-black text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {memos.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-slate-400">No Cash Memos found.</td></tr>
            ) : (
              memos.map((memo) => (
                <tr key={memo.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-800">{memo.memo_number}</td>
                  <td className="p-4 text-sm text-slate-500 flex items-center gap-2"><Calendar className="w-4 h-4"/> {memo.memo_date}</td>
                  <td className="p-4 text-sm font-medium text-slate-700">{memo.customer_name || "Walk-in"}</td>
                  <td className="p-4 text-right font-black text-slate-800">₹{memo.total_amount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}