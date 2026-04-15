"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { User, Receipt, CreditCard, Layers, Calendar, Edit2, Trash2, ArrowLeft, History, CheckCircle, ImageIcon, FileText } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

export default function CashMemoDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const memoId = resolvedParams.id
  const router = useRouter()
  const supabase = createClient()

  const { hasPermission } = useAuth()

  const [memo, setMemo] = useState<any>(null)
  const [versions, setVersions] = useState<any[]>([])
  const [selectedVersion, setSelectedVersion] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)

  const loadMemo = async () => {
    setIsLoading(true);
    setDbError(null);

    const { data: memoData, error } = await supabase.from('cash_memos').select(`
      *,
      cash_memo_items ( id, item_id, quantity, unit_price, gst_rate, items ( name, sku, image_path, sub_categories(name), sub_sub_categories(name) ) ),
      payments ( id, amount, payment_mode, transaction_reference, payment_date )
    `).eq('id', memoId).maybeSingle();

    if (error) { setDbError(error.message); setIsLoading(false); return; }
    if (!memoData) { setDbError("Cash Memo ID does not exist."); setIsLoading(false); return; }

    setMemo(memoData);

    const { data: versionData } = await supabase
      .from('cash_memo_versions')
      .select('id, version_number, created_at, snapshot_data')
      .eq('cash_memo_id', memoId)
      .order('version_number', { ascending: false });
      
    if (versionData) setVersions(versionData);

    setIsLoading(false);
  }

  useEffect(() => {
    loadMemo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, memoId]);

  const handleDelete = async () => {
    if (!window.confirm(`Are you absolutely sure you want to cancel/delete ${memo?.memo_number}? This will refund the items back to Office stock.`)) return;

    const { error } = await supabase.rpc('delete_cash_memo_safely', { p_memo_id: memoId });
    if (error) alert("Failed to delete memo: " + error.message);
    else router.push('/cash-memo');
  }

  if (isLoading) return <div className="p-20 text-center text-slate-500 font-bold">Loading Cash Memo...</div>;
  if (dbError) return <div className="p-20 text-center text-red-600 font-bold bg-red-50 border border-red-200 m-10 rounded-xl">Database Error: {dbError}</div>;
  if (!memo) return <div className="p-20 text-center text-red-500 font-bold">Cash Memo not found.</div>;

  const displayData = selectedVersion ? selectedVersion.snapshot_data : memo;
  const isHistorical = !!selectedVersion;

  let subtotal = 0;
  displayData.cash_memo_items?.forEach((item: any) => subtotal += (item.unit_price * item.quantity));
  
  const discountAmt = Number(displayData.discount_value) || 0;
  const taxableAmount = Math.max(0, subtotal - discountAmt);
  
  let gstTotal = 0;
  if (displayData.is_gst_applied) {
    displayData.cash_memo_items?.forEach((item: any) => {
      const lineDiscount = subtotal > 0 ? (item.unit_price * item.quantity) / subtotal * discountAmt : 0;
      const lineTaxable = (item.unit_price * item.quantity) - lineDiscount;
      gstTotal += lineTaxable * ((item.gst_rate || 18) / 100);
    });
  }

  const grandTotal = Number(displayData.total_amount);
  const totalPaid = displayData.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
  const balanceDue = Math.max(0, grandTotal - totalPaid);

  return (
    <>
      <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20 print:hidden">

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/cash-memo')} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 shadow-sm"><ArrowLeft className="w-5 h-5" /></button>
            <h1 className="text-xl font-bold text-slate-800">Back to List</h1>
          </div>

          <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition-colors text-sm">
            <Receipt className="w-4 h-4" /> Print Cash Memo
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-6">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-800">{displayData.memo_number}</h2>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${balanceDue === 0 ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                  {balanceDue === 0 ? 'Fully Paid' : 'Pending Balance'}
                </span>
                
                {isHistorical && <span className="px-2.5 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><History className="w-3 h-3" /> Viewing V{selectedVersion.version_number}</span>}
              </div>
              <p className="text-sm text-slate-500 font-medium mt-1 flex items-center gap-2"><Calendar className="w-4 h-4" /> {new Date(displayData.memo_date).toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {versions.length > 0 && (
              <select
                value={selectedVersion ? selectedVersion.id : "current"}
                onChange={(e) => {
                  if (e.target.value === "current") setSelectedVersion(null);
                  else setSelectedVersion(versions.find(v => v.id === e.target.value));
                }}
                className="p-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="current">Current Version</option>
                {versions.map(v => <option key={v.id} value={v.id}>Version {v.version_number} ({new Date(v.created_at).toLocaleDateString()})</option>)}
              </select>
            )}

            {!isHistorical && (
              <>
                {hasPermission('edit_cash_memos') && (
                  <Link href={`/cash-memo/${memoId}/edit`} className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition-colors text-sm">
                    <Edit2 className="w-4 h-4" /> Edit
                  </Link>
                )}

                {hasPermission('delete_cash_memos') && (
                  <button onClick={handleDelete} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition-colors text-sm">
                    <Trash2 className="w-4 h-4" /> Delete Memo
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 opacity-95">

          <div className="lg:col-span-2 space-y-6">

            {/* ⚡ NEW: Customer Info + Narration Box */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><User className="w-3 h-3" /> Customer Info</h3>
                  <p className="font-bold text-slate-800">{displayData.customer_name || 'Walk-in Customer'}</p>
                  {displayData.customer_mobile && <p className="font-mono text-sm text-slate-600 mt-1">{displayData.customer_mobile}</p>}
                </div>
                
                {displayData.narration && (
                  <div className="flex-1 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><FileText className="w-3 h-3" /> Narration / Notes</h3>
                    <p className="text-sm font-medium text-slate-700 italic border-l-2 border-blue-400 pl-3 py-1 bg-slate-50 rounded-r-md">"{displayData.narration}"</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-600" /> Purchased Items</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                    <tr><th className="py-3 px-6">Item Details</th><th className="py-3 px-4 text-right">Price (₹)</th><th className="py-3 px-4 text-center">Qty</th><th className="py-3 px-6 text-right">Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {displayData.cash_memo_items?.map((item: any) => {
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 bg-slate-100 rounded-md border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                {item.items?.image_path ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.items.image_path} alt={item.items.name} className="h-full w-full object-cover" />
                                ) : (
                                  <ImageIcon className="w-5 h-5 text-slate-300" />
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-slate-800">{item.items?.name}</div>
                                <div className="text-[10px] text-blue-600 font-semibold uppercase mt-0.5">{item.items?.sub_categories?.name} › {item.items?.sub_sub_categories?.name || 'Standard'}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.items?.sku}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right font-medium text-slate-700">{item.unit_price.toLocaleString()}</td>
                          <td className="py-4 px-4 text-center font-black text-slate-800 text-lg">{item.quantity}</td>
                          <td className="py-4 px-6 text-right font-black text-slate-800">₹{(item.unit_price * item.quantity).toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <div className="space-y-6 lg:sticky lg:top-6 self-start w-full">

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2"><Receipt className="w-4 h-4 text-blue-600" /> Tax & Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Subtotal</span><span className="font-bold text-slate-800">₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                {discountAmt > 0 && <div className="flex justify-between items-center pb-3 border-b border-slate-100"><span className="text-slate-500 font-medium">Discount</span><span className="text-red-600 font-bold">- ₹{discountAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
                
                {displayData.is_gst_applied && (
                   <div className="flex justify-between items-center text-slate-500 pb-3 border-b border-slate-100"><span>GST Applied</span><span>+ ₹{gstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                )}
                
                <div className="flex justify-between items-center pt-2"><span className="text-slate-500 font-bold">Grand Total</span><span className="text-xl font-black text-blue-600">₹{grandTotal.toLocaleString()}</span></div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
              <div className={`p-6 text-center ${balanceDue === 0 ? 'bg-green-600' : 'bg-slate-800'}`}>
                <p className="text-white/70 font-bold uppercase tracking-wider text-xs mb-1">Balance Due</p>
                <h2 className="text-4xl font-black text-white">₹{balanceDue.toLocaleString()}</h2>
                {balanceDue === 0 && <span className="inline-flex items-center gap-1 text-green-200 text-xs font-bold mt-2"><CheckCircle className="w-4 h-4" /> Fully Paid</span>}
              </div>

              <div className="p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-green-600" /> Payment History</h3>
                </div>

                {displayData.payments && displayData.payments.length > 0 ? (
                  <div className="space-y-3 mb-4">
                    {displayData.payments.map((p: any) => (
                      <div key={p.id} className="bg-slate-50 border border-slate-100 p-3 rounded-lg flex justify-between items-center">
                        <div>
                          <p className={`font-bold ${p.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {p.amount < 0 ? '-' : ''}₹{Math.abs(p.amount).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {new Date(p.payment_date || p.created_at).toLocaleDateString()} • {p.payment_mode}
                            {p.amount < 0 && <span className="ml-2 font-bold text-red-500 uppercase">Refund</span>}
                          </p>
                        </div>
                        {p.transaction_reference && <span className="text-[10px] font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-500 max-w-[80px] truncate" title={p.transaction_reference}>{p.transaction_reference}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs font-bold text-red-400 bg-red-50 rounded-lg mb-4 border border-red-100">No payments recorded.</div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-500 uppercase">Total Collected</span>
                  <span className="font-black text-green-700 text-lg">₹{totalPaid.toLocaleString()}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <style type="text/css" media="print">
        {`
          @page { size: auto; margin: 0mm; }
          body { margin: 1cm; }
        `}
      </style>

      {/* --- PRINTABLE A4 RECEIPT --- */}
      <div
        className="hidden print:block w-full bg-white text-black p-4 font-sans"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">{process.env.NEXT_PUBLIC_COMPANY_NAME || "Company Name"}</h1>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1">Premium Quality Packaging</p>
            <div className="mt-3 text-xs text-slate-600 space-y-0.5">
              <p>123 Industrial Estate, Phase 1</p>
              <p>Mumbai, Maharashtra 400001</p>
              <p>Phone: +91 98765 43210</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-black text-slate-200 uppercase tracking-widest">CASH MEMO</h2>
            <div className="mt-4 bg-slate-50 border border-slate-200 p-3 rounded text-left inline-block min-w-[200px]">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Memo Number</p>
              <p className="text-lg font-black text-slate-800">{displayData.memo_number}</p>
              <div className="h-px bg-slate-200 my-2"></div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Date</p>
              <p className="text-sm font-bold text-slate-800">{new Date(displayData.memo_date).toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
            </div>
          </div>
        </div>

        <div className="mb-8 flex justify-between items-start">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase border-b border-slate-200 pb-1 mb-2 inline-block">Customer Details</p>
            <h3 className="text-lg font-black text-slate-800">{displayData.customer_name || 'Walk-in Customer'}</h3>
            {displayData.customer_mobile && <p className="text-sm text-slate-600 mt-1">Mobile: {displayData.customer_mobile}</p>}
          </div>

          {/* ⚡ NEW: Narration on Print View */}
          {displayData.narration && (
            <div className="max-w-xs text-right">
              <p className="text-xs font-bold text-slate-400 uppercase border-b border-slate-200 pb-1 mb-2 inline-block">Notes</p>
              <p className="text-sm text-slate-700 italic mt-1 leading-relaxed">"{displayData.narration}"</p>
            </div>
          )}
        </div>

        <table className="w-full text-sm text-left mb-8 border border-slate-200">
          <thead className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase text-slate-600 font-black">
            <tr>
              <th className="py-3 px-4 w-12 text-center">#</th>
              <th className="py-3 px-4">Product Description</th>
              <th className="py-3 px-4 text-center">SKU</th>
              <th className="py-3 px-4 text-right">Qty</th>
              <th className="py-3 px-4 text-right">Rate</th>
              <th className="py-3 px-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {displayData.cash_memo_items?.map((item: any, idx: number) => (
              <tr key={item.id} className="print-color-adjust-exact">
                <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                <td className="py-3 px-4 font-bold text-slate-800">{item.items?.name}</td>
                <td className="py-3 px-4 text-center font-mono text-xs text-slate-600">{item.items?.sku}</td>
                <td className="py-3 px-4 text-right font-black text-slate-800">{item.quantity}</td>
                <td className="py-3 px-4 text-right text-slate-700">₹{item.unit_price.toLocaleString()}</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">₹{(item.unit_price * item.quantity).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-80">
            <div className="space-y-2 text-sm border border-slate-200 rounded p-4 bg-slate-50">
              <div className="flex justify-between"><span className="text-slate-600 font-medium">Subtotal</span><span className="font-bold">₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              {discountAmt > 0 && <div className="flex justify-between"><span className="text-slate-600 font-medium">Discount</span><span className="font-bold text-red-600">- ₹{discountAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
              {displayData.is_gst_applied && <div className="flex justify-between text-xs"><span className="text-slate-500">GST Applied</span><span className="text-slate-700">+ ₹{gstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
              
              <div className="h-px bg-slate-200 my-1"></div>
              <div className="flex justify-between items-center"><span className="font-bold text-slate-800 uppercase">Grand Total</span><span className="text-xl font-black text-slate-900">₹{grandTotal.toLocaleString()}</span></div>
            </div>
            <p className="text-center text-xs font-bold text-slate-400 uppercase mt-4">Thank you for your business!</p>
          </div>
        </div>

      </div>
    </>
  )
}