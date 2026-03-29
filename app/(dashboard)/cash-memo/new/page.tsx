"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Plus, Trash2, Save, User, Receipt, CreditCard, Search, Image as ImageIcon, X, Layers, Minus, AlertTriangle, CheckCircle } from "lucide-react"
import { usePermissions } from "@/hooks/usePermissions"

export default function NewCashMemoPage() {
  const router = useRouter()
  const supabase = createClient()
  const { isCategoryAllowed } = usePermissions()

  // --- CORE STATE ---
  const [customerInfo, setCustomerInfo] = useState({ name: "Walk-in Customer", mobile: "" })
  const [isGstApplied, setIsGstApplied] = useState(false)
  const [discountInput, setDiscountInput] = useState("")
  const [orderItems, setOrderItems] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const defaultPayment = () => ({ amount: "", mode: "Cash" });
  const [paymentRecords, setPaymentRecords] = useState([defaultPayment()]);

  // --- CATALOG STATE ---
  const [isCatalogOpen, setIsCatalogOpen] = useState(false)
  const [catalogItems, setCatalogItems] = useState<any[]>([])
  const [catalogSearch, setCatalogSearch] = useState("")
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false)

  const openCatalog = async () => {
    setIsCatalogOpen(true);
    setIsLoadingCatalog(true);

    const { data: itemsData } = await supabase.from('items').select(`
      id, name, sku, price, gst_rate, image_path, pack_size,
      sub_categories(name, categories(name)), sub_sub_categories(name),
      stock(quantity)
    `);

    if (itemsData) {
      const permitted = itemsData.filter((item: any) => isCategoryAllowed(item.sub_categories?.categories?.name));
      setCatalogItems(permitted);
    }
    setIsLoadingCatalog(false);
  }

  const filteredCatalog = catalogItems.filter(item => {
    const searchableText = `${item.sub_categories?.name || ''} ${item.sub_sub_categories?.name || ''} ${item.name || ''} ${item.sku || ''}`.toLowerCase();
    const searchTerms = catalogSearch.toLowerCase().trim().split(/\s+/);
    return searchTerms.every(term => searchableText.includes(term));
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const handleCatalogAdd = (item: any) => {
    const packSize = item.pack_size || 10;
    const existing = orderItems.find(i => i.item_id === item.id);
    if (existing) updateItem(item.id, 'qty', existing.qty + packSize);
    else setOrderItems([...orderItems, {
      item_id: item.id, image_path: item.image_path || null, name: item.name, sku: item.sku, price: item.price,
      qty: packSize, gst_rate: item.gst_rate || 0, pack_size: packSize, path: `${item.sub_categories?.name || ''} › ${item.sub_sub_categories?.name || 'Standard'}`
    }]);
  }

  const handleCatalogRemove = (item: any) => {
    const packSize = item.pack_size || 10;
    const existing = orderItems.find(i => i.item_id === item.id);
    if (!existing) return;
    if (existing.qty <= packSize) removeItem(item.id);
    else updateItem(item.id, 'qty', existing.qty - packSize);
  }

  const updateItem = (id: string, field: string, value: number) => setOrderItems(orderItems.map(i => i.item_id === id ? { ...i, [field]: value } : i))
  const removeItem = (id: string) => setOrderItems(orderItems.filter(i => i.item_id !== id))

  const addPaymentRow = () => setPaymentRecords([...paymentRecords, defaultPayment()]);
  const removePaymentRow = (index: number) => setPaymentRecords(paymentRecords.filter((_, i) => i !== index));
  const updatePaymentRow = (index: number, field: string, value: string) => {
    const newRecords = [...paymentRecords];
    newRecords[index] = { ...newRecords[index], [field]: value };
    setPaymentRecords(newRecords);
  }

  // --- FINANCIAL MATH ENGINE ---
  let subtotal = 0; orderItems.forEach(item => subtotal += (item.price * item.qty));
  let discountAmt = 0;
  const cleanDiscount = discountInput.replace('-', '').trim();
  if (cleanDiscount.includes('%')) {
    const pct = parseFloat(cleanDiscount.replace('%', ''));
    if (!isNaN(pct)) discountAmt = subtotal * (pct / 100);
  } else {
    const flat = parseFloat(cleanDiscount);
    if (!isNaN(flat)) discountAmt = flat;
  }
  if (discountAmt > subtotal) discountAmt = subtotal;

  const taxableAmount = subtotal - discountAmt;
  const discountFraction = subtotal > 0 ? discountAmt / subtotal : 0;
  
  let cgstTotal = 0; let sgstTotal = 0;
  
  if (isGstApplied) {
    orderItems.forEach(item => {
      const itemTaxable = (item.price * item.qty) - ((item.price * item.qty) * discountFraction);
      cgstTotal += itemTaxable * ((item.gst_rate / 2) / 100);
      sgstTotal += itemTaxable * ((item.gst_rate / 2) / 100);
    });
  }

  // THE FIX: Grand Total vs Rounded Total logic mapped correctly
  const grandTotal = taxableAmount + cgstTotal + sgstTotal;
  const roundedTotal = Math.round(grandTotal);
  const totalPaid = paymentRecords.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const balanceDue = roundedTotal - totalPaid;

  // Set the first payment row to the rounded total automatically if there's only one row
  useEffect(() => {
    if (paymentRecords.length === 1 && roundedTotal > 0 && paymentRecords[0].amount === "") {
      const newRecords = [...paymentRecords];
      newRecords[0].amount = roundedTotal.toString();
      setPaymentRecords(newRecords);
    }
  }, [roundedTotal]);

  // --- SAVE LOGIC ---
  const handleSaveMemo = async () => {
    if (orderItems.length === 0) return alert("Add at least one item to the memo.");
    if (balanceDue !== 0) return alert("Cash Memos must be paid in full immediately. The Balance Due must be ₹0.");
    
    setIsSaving(true);

    const { data: newMemoId, error: rpcError } = await supabase.rpc('create_cash_memo_atomic', {
      payload: {
        customer: { name: customerInfo.name, mobile: customerInfo.mobile },
        memo: { is_gst_applied: isGstApplied, discount_value: discountInput, total_amount: roundedTotal },
        items: orderItems.map(item => ({ id: item.item_id, quantity: item.qty, price: item.price, gst_rate: isGstApplied ? item.gst_rate : 0 })),
        payments: paymentRecords.filter(p => Number(p.amount) > 0).map(p => ({ amount: Number(p.amount), payment_mode: p.mode }))
      }
    });

    if (rpcError) {
      alert("Checkout Failed: " + rpcError.message);
      setIsSaving(false);
      return;
    }

    alert("Cash Memo Generated & Stock Deducted!");
    
    // Reset form for the next customer walk-in!
    setCustomerInfo({ name: "Walk-in Customer", mobile: "" });
    setOrderItems([]);
    setDiscountInput("");
    setIsGstApplied(false);
    setPaymentRecords([defaultPayment()]);
    setIsSaving(false);
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-emerald-200 border-l-4 border-l-emerald-500">
        <div><h2 className="text-2xl font-bold text-slate-800">Point of Sale (Cash Memo)</h2><p className="text-sm text-slate-500">Over-the-counter sales. Instantly deducts stock. No pending balances.</p></div>
        <button onClick={handleSaveMemo} disabled={isSaving || orderItems.length === 0 || balanceDue !== 0} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg shadow font-bold flex items-center justify-center gap-2 disabled:opacity-50 w-full md:w-auto transition-colors">
          <Save className="w-5 h-5" /> {isSaving ? "Processing..." : "Generate Memo"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* BASIC CUSTOMER */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><User className="w-4 h-4 text-emerald-600" /> Walk-in Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-xs font-bold text-slate-500 uppercase">Customer Name</label><input type="text" value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:border-emerald-500" /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">Mobile Number (Optional)</label><input type="text" value={customerInfo.mobile} onChange={e => setCustomerInfo({ ...customerInfo, mobile: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:border-emerald-500" placeholder="e.g. 9876543210" /></div>
            </div>
          </div>

          {/* ITEMS */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-600" /> Counter Items</h3>
              <button onClick={openCatalog} className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300 px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
                <Search className="w-4 h-4" /> Browse Catalog
              </button>
            </div>

            {orderItems.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-y border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-3 px-4">Item</th><th className="py-3 px-4 w-24">Price</th><th className="py-3 px-4 w-24">Qty</th><th className="py-3 px-4 text-right">Total</th><th className="py-3 px-4 text-center"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orderItems.map((item) => (
                    <tr key={item.item_id}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-slate-100 rounded-md border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                            {item.image_path ? <img src={item.image_path} alt={item.name} className="h-full w-full object-cover" /> : <ImageIcon className="w-5 h-5 text-slate-300" />}
                          </div>
                          <div><div className="font-bold text-slate-800">{item.name}</div><div className="text-[10px] text-emerald-600 font-semibold uppercase">{item.sku}</div></div>
                        </div>
                      </td>
                      <td className="py-3 px-4"><input type="number" value={item.price} onChange={e => updateItem(item.item_id, 'price', Number(e.target.value))} className="w-full p-1.5 border border-slate-300 rounded outline-none focus:border-emerald-500" /></td>
                      <td className="py-3 px-4"><input type="number" min="1" value={item.qty} onChange={e => updateItem(item.item_id, 'qty', Number(e.target.value))} className="w-full p-1.5 border border-slate-300 rounded outline-none focus:border-emerald-500 text-center font-bold bg-emerald-50 text-emerald-900" /></td>
                      <td className="py-3 px-4 text-right font-bold text-slate-700">₹{(item.price * item.qty).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center"><button onClick={() => removeItem(item.item_id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg"><p className="text-slate-500 font-medium mb-3">Counter is empty.</p></div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-6 text-white">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
              <h3 className="font-bold flex items-center gap-2"><Receipt className="w-4 h-4 text-emerald-400" /> Billing Total</h3>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-bold bg-slate-700 px-3 py-1.5 rounded-full hover:bg-slate-600 transition-colors">
                <input type="checkbox" checked={isGstApplied} onChange={e => setIsGstApplied(e.target.checked)} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
                Apply GST Bill
              </label>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center"><span className="text-slate-400 font-medium">Subtotal</span><span className="font-bold">₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between items-center pb-3 border-b border-slate-700">
                <span className="text-slate-400 font-medium">Discount</span>
                <div className="flex items-center gap-2">
                  <input type="text" value={discountInput} onChange={e => setDiscountInput(e.target.value)} placeholder="0" className="w-20 p-1 text-right bg-slate-700 border border-slate-600 rounded outline-none focus:border-emerald-500 text-xs font-bold text-white placeholder:text-slate-500" />
                </div>
              </div>
              <div className="flex justify-between items-center"><span className="text-slate-300 font-bold">Taxable Amount</span><span className="font-bold">₹{taxableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              
              {isGstApplied && (
                <><div className="flex justify-between items-center text-slate-400"><span>CGST</span><span>+ ₹{cgstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div><div className="flex justify-between items-center text-slate-400 pb-3 border-b border-slate-700"><span>SGST</span><span>+ ₹{sgstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div></>
              )}
              
              <div className="flex justify-between items-center pt-2"><span className="text-lg font-black">Grand Total</span><span className="text-3xl font-black text-emerald-400">₹{roundedTotal.toLocaleString()}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600" /> Immediate Payment</h3><button onClick={addPaymentRow} className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Split Method</button></div>
            
            <div className="space-y-3">
              {paymentRecords.map((payment, index) => (
                <div key={index} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <input type="number" value={payment.amount} onChange={e => updatePaymentRow(index, 'amount', e.target.value)} className="w-1/2 p-2 border border-slate-300 rounded outline-none focus:border-emerald-500 font-bold text-emerald-700 text-sm" placeholder="Amount" />
                  <select value={payment.mode} onChange={e => updatePaymentRow(index, 'mode', e.target.value)} className="w-1/2 p-2 border border-slate-300 rounded outline-none focus:border-emerald-500 bg-white text-sm"><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Card">Card</option></select>
                  {paymentRecords.length > 1 && <button onClick={() => removePaymentRow(index)} className="text-red-500 p-2 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>}
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              {balanceDue === 0 ? (
                <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg flex items-center justify-center gap-2 font-black text-lg"><CheckCircle className="w-5 h-5"/> Fully Paid</div>
              ) : (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center justify-between font-black text-lg"><span className="flex items-center gap-2 text-sm"><AlertTriangle className="w-5 h-5"/> Pending Due</span> ₹{balanceDue.toLocaleString()}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CATALOG MODAL */}
      {isCatalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
          <div className="bg-slate-50 w-full max-w-7xl h-full rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-white p-5 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div><h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Search className="w-6 h-6 text-emerald-600" /> Point of Sale Catalog</h2></div>
              <button onClick={() => setIsCatalogOpen(false)} className="p-2 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="bg-white p-4 border-b border-slate-200 shrink-0"><input type="text" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Smart Search: Type '100 cake' to find matching boxes..." className="w-full p-3 border-2 border-emerald-100 rounded-xl outline-none focus:border-emerald-500 text-lg font-medium shadow-sm" autoFocus /></div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
              {isLoadingCatalog ? (<div className="flex h-full items-center justify-center text-slate-400 font-bold text-lg">Loading Stock...</div>) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                  {filteredCatalog.map(item => {
                    let totalAct = 0;
                    item.stock?.forEach((s: any) => { totalAct += s.quantity; });
                    const cartItem = orderItems.find(i => i.item_id === item.id);
                    const packSize = item.pack_size || 10;
                    return (
                      <div key={item.id} className={`bg-white border-2 rounded-xl overflow-hidden flex flex-col transition-all ${cartItem ? 'border-emerald-500 shadow-md ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'}`}>
                        <div className="h-40 w-full bg-slate-100 relative">
                          {item.image_path ? ( /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.image_path} alt={item.name} className="h-full w-full object-cover" />) : <div className="h-full w-full flex items-center justify-center"><ImageIcon className="w-10 h-10 text-slate-300" /></div>}
                          <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded">Pack of {packSize}</div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1 leading-tight">{item.sub_categories?.name || 'Uncategorized'} › {item.sub_sub_categories?.name || 'Standard'}</p>
                          <div className="flex justify-between items-start gap-2 mb-1"><h4 className="font-bold text-slate-800 leading-tight">{item.name}</h4><span className="font-black text-slate-800">₹{item.price}</span></div>
                          <p className="text-xs text-slate-400 font-mono mb-3">{item.sku}</p>
                          <div className="flex gap-3 text-xs font-mono mt-auto bg-slate-100 px-2 py-1 rounded w-fit"><span className="font-bold text-slate-700">Stock: {totalAct}</span></div>
                        </div>
                        <div className="p-3 bg-slate-50 border-t border-slate-100">
                          {cartItem ? (
                            <div className="flex items-center justify-between bg-emerald-50 rounded-lg p-1 border border-emerald-200">
                              <button onClick={() => handleCatalogRemove(item)} className="p-2 bg-white rounded shadow-sm text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors"><Minus className="w-4 h-4" /></button>
                              <div className="flex flex-col items-center"><span className="font-black text-emerald-800">{cartItem.qty} <span className="text-xs font-semibold">Qty</span></span></div>
                              <button onClick={() => handleCatalogAdd(item)} className="p-2 bg-white rounded shadow-sm text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors"><Plus className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => handleCatalogAdd(item)} className="w-full py-2 bg-white border border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 text-slate-700 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add to Bill</button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="bg-white p-4 border-t border-slate-200 flex justify-between items-center shrink-0">
              <span className="text-sm font-bold text-slate-500">{filteredCatalog.length} Products Found</span>
              <button onClick={() => setIsCatalogOpen(false)} className="bg-slate-800 text-white px-8 py-3 rounded-xl font-bold shadow hover:bg-slate-900">Done Selecting Items</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}