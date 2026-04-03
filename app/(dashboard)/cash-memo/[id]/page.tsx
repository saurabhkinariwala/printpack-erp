"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { User, MapPin, Receipt, CreditCard, Layers, Calendar, Edit2, Trash2, ArrowLeft, Package, History, Plus, X, CheckCircle, AlertTriangle } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

export default function CashMemoDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const memoId = resolvedParams.id
  const router = useRouter()
  const supabase = createClient()

  const { hasPermission } = useAuth()

  const [memo, setMemo] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: "", mode: "Cash", reference: "", date: new Date().toISOString().split('T')[0] })

  const [isSaving, setIsSaving] = useState(false)

  const loadMemo = async () => {
    setIsLoading(true);
    setDbError(null);

    const { data: memoData, error } = await supabase.from('cash_memos').select(`
      id, memo_number, memo_date, customer_name, customer_mobile, total_amount, discount_value, is_gst_applied, created_at,
      cash_memo_items (
        id, item_id, quantity, unit_price, gst_rate,
        items ( name, sku, image_path, pack_size, sub_categories(name), sub_sub_categories(name) )
      ),
      payments ( id, amount, payment_mode, transaction_reference, payment_date, created_at )
    `).eq('id', memoId).maybeSingle();

    if (error) { setDbError(error.message); setIsLoading(false); return; }
    if (!memoData) { setDbError("Cash Memo ID does not exist."); setIsLoading(false); return; }

    setMemo(memoData);
    setIsLoading(false);
  }

  useEffect(() => {
    loadMemo();
  }, [memoId]);

  const handleDelete = async () => {
    if (!window.confirm(`Are you absolutely sure you want to delete cash memo ${memo.memo_number}? This will also delete all associated items and payments.`)) return;

    const { error } = await supabase.from('cash_memos').delete().eq('id', memoId);
    if (error) {
      alert("Failed to delete cash memo: " + error.message);
    } else {
      router.push('/cash-memo');
    }
  }

  const handleAddPayment = async () => {
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      alert("Please enter a valid payment amount.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from('payments').insert({
      cash_memo_id: memoId,
      amount: Number(paymentForm.amount),
      payment_mode: paymentForm.mode,
      transaction_reference: paymentForm.reference || null,
      payment_date: paymentForm.date,
    });

    if (error) {
      alert("Failed to add payment: " + error.message);
    } else {
      setIsPaymentModalOpen(false);
      setPaymentForm({ amount: "", mode: "Cash", reference: "", date: new Date().toISOString().split('T')[0] });
      await loadMemo();
    }

    setIsSaving(false);
  }

  const getPaymentBadge = (totalAmount: number, payments: any[]) => {
    const totalPaid = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

    let percent = 0;
    if (totalAmount > 0) percent = Math.round((totalPaid / totalAmount) * 100);
    else if (totalPaid > 0) percent = 100;

    if (percent === 0) {
      return <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-200 shadow-sm">Unpaid</span>;
    }
    if (percent >= 100) {
      return <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-green-200 shadow-sm">Fully Paid</span>;
    }

    return (
      <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-yellow-300 shadow-sm">
        Partially Paid ({percent}%)
      </span>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="text-center text-slate-500">Loading cash memo details...</div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <AlertTriangle className="w-5 h-5 inline mr-2" />
          {dbError}
        </div>
        <div className="mt-4">
          <Link href="/cash-memo" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Cash Memos
          </Link>
        </div>
      </div>
    );
  }

  const totalPaid = memo.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
  const balanceDue = Math.max(0, memo.total_amount - totalPaid);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-20">

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Link href="/cash-memo" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <Receipt className="w-6 h-6 text-blue-600" />
                Cash Memo {memo.memo_number}
              </h1>
              <p className="text-sm text-slate-500">Created on {new Date(memo.memo_date).toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {getPaymentBadge(memo.total_amount, memo.payments)}
            {hasPermission('edit_cash_memos') && (
              <Link href={`/cash-memo/${memo.id}/edit`} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold flex items-center gap-2 transition-colors">
                <Edit2 className="w-4 h-4" /> Edit
              </Link>
            )}
            {hasPermission('delete_cash_memos') && (
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center gap-2 transition-colors">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" /> Customer Details
            </h3>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Name:</span> {memo.customer_name || 'Walk-in Customer'}</p>
              {memo.customer_mobile && <p><span className="font-medium">Mobile:</span> {memo.customer_mobile}</p>}
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Payment Summary
            </h3>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Total Amount:</span> ₹{memo.total_amount.toLocaleString()}</p>
              <p><span className="font-medium">Amount Paid:</span> ₹{totalPaid.toLocaleString()}</p>
              <p><span className="font-medium">Balance Due:</span> ₹{balanceDue.toLocaleString()}</p>
              {memo.discount_value > 0 && <p><span className="font-medium">Discount:</span> ₹{memo.discount_value.toLocaleString()}</p>}
              <p><span className="font-medium">GST Applied:</span> {memo.is_gst_applied ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-5 h-5" /> Items Purchased
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Item</th>
                <th className="px-6 py-3 text-center font-bold text-slate-600">Qty</th>
                <th className="px-6 py-3 text-right font-bold text-slate-600">Unit Price</th>
                <th className="px-6 py-3 text-right font-bold text-slate-600">GST Rate</th>
                <th className="px-6 py-3 text-right font-bold text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {memo.cash_memo_items?.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{item.items?.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{item.items?.sku}</div>
                    {item.items?.sub_categories?.name && (
                      <div className="text-xs text-slate-400">{item.items.sub_categories.name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center font-medium">{item.quantity}</td>
                  <td className="px-6 py-4 text-right font-medium">₹{item.unit_price}</td>
                  <td className="px-6 py-4 text-right font-medium">{item.gst_rate}%</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-800">
                    ₹{(item.quantity * item.unit_price).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Payment History
          </h3>
          {balanceDue > 0 && (
            <button onClick={() => setIsPaymentModalOpen(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-2 transition-colors">
              <Plus className="w-4 h-4" /> Add Payment
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Date</th>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Mode</th>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Reference</th>
                <th className="px-6 py-3 text-right font-bold text-slate-600">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {memo.payments?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No payments recorded yet.</td>
                </tr>
              ) : (
                memo.payments?.map((payment: any) => (
                  <tr key={payment.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium">
                      {new Date(payment.payment_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                        {payment.payment_mode}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {payment.transaction_reference || '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-green-600">
                      ₹{payment.amount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50 shrink-0">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5 text-blue-600" /> Add Payment
              </h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-red-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Payment Date</label>
                <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Payment Mode</label>
                <select value={paymentForm.mode} onChange={e => setPaymentForm({...paymentForm, mode: e.target.value})}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank">Bank Transfer</option>
                  <option value="Card">Card</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Amount</label>
                <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})}
                  placeholder="0.00" className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Reference (Optional)</label>
                <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})}
                  placeholder="Transaction ID, etc." className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm" />
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setIsPaymentModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={handleAddPayment} disabled={isSaving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {isSaving ? "Adding..." : "Add Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}