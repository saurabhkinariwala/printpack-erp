"use client"

import { useState, useEffect, useRef, use } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search, Plus, Trash2, Calendar, User, IndianRupee, Save, Loader2, Receipt, ArrowLeft, FileText } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

type CatalogItem = {
  id: string
  name: string
  sku: string
  price: number
  gst_rate: number
  pack_size: number
  available_qty: number
}

type CartItem = CatalogItem & {
  cart_qty: number
}

type PaymentSplit = {
  mode: string
  amount: string
  date: string
}

export default function EditCashMemoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const memoId = resolvedParams.id
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [memoDate, setMemoDate] = useState(new Date().toISOString().split('T')[0])
  const [customerName, setCustomerName] = useState("")
  const [customerMobile, setCustomerMobile] = useState("")
  const [narration, setNarration] = useState("") // ⚡ NEW: Narration state

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [isGstApplied, setIsGstApplied] = useState(false)
  const [discountAmount, setDiscountAmount] = useState<number>(0)

  const todayDate = new Date().toISOString().split('T')[0];
  const [payments, setPayments] = useState<PaymentSplit[]>([{ mode: "Cash", amount: "", date: todayDate }])
  
  useEffect(() => {
    async function fetchData() {
      // Fetch office location
      const { data: locData } = await supabase.from('locations').select('id').ilike('name', '%Office%').limit(1).single();
      const officeId = locData?.id;

      // Fetch catalog
      const { data: itemsData } = await supabase.from('items').select(`id, name, sku, price, gst_rate, pack_size, stock ( quantity, location_id )`)

      let mappedCatalog: CatalogItem[] = [];

      if (itemsData && officeId) {
        mappedCatalog = itemsData.map((item: any) => {
          const officeStock = item.stock?.find((s: any) => s.location_id === officeId);
          return {
            id: item.id, name: item.name, sku: item.sku,
            price: Number(item.price) || 0, gst_rate: Number(item.gst_rate) || 18,
            pack_size: item.pack_size || 1,
            available_qty: officeStock ? officeStock.quantity : 0
          }
        });
        setCatalog(mappedCatalog)
      }

      // ⚡ FIX: Added 'narration' to the SELECT query
      const { data: memoData } = await supabase.from('cash_memos').select(`
        id, memo_number, memo_date, customer_name, customer_mobile, narration, total_amount, discount_value, is_gst_applied,
        cash_memo_items (
          id, item_id, quantity, unit_price, gst_rate,
          items ( name, sku, price, gst_rate, pack_size )
        ),
        payments ( amount, payment_mode, payment_date )
      `).eq('id', memoId).single();

      if (memoData) {
        setMemoDate(memoData.memo_date);
        setCustomerName(memoData.customer_name || "");
        setCustomerMobile(memoData.customer_mobile || "");
        setNarration(memoData.narration || ""); // ⚡ Load existing narration
        setIsGstApplied(memoData.is_gst_applied);
        setDiscountAmount(memoData.discount_value || 0);

        // Load items into cart
        const cartItems: CartItem[] = memoData.cash_memo_items.map((item: any) => ({
          id: item.item_id,
          name: item.items.name,
          sku: item.items.sku,
          price: item.unit_price,
          gst_rate: item.gst_rate,
          pack_size: item.items.pack_size || 1,
          available_qty: 0, 
          cart_qty: item.quantity
        }));

        const updatedCart = cartItems.map(cartItem => {
          const catalogItem = mappedCatalog.find(c => c.id === cartItem.id);
          return { ...cartItem, available_qty: catalogItem?.available_qty || 0 };
        });

        setCart(updatedCart);

        // Load payments
        if (memoData.payments && memoData.payments.length > 0) {
          const paymentSplits: PaymentSplit[] = memoData.payments.map((p: any) => {
            const dateString = p.payment_date 
              ? new Date(p.payment_date).toISOString().split('T')[0] 
              : memoData.memo_date;

            return {
              mode: p.payment_mode,
              amount: p.amount.toString(),
              date: dateString
            };
          });
          setPayments(paymentSplits);
        }
      }

      setIsLoading(false)
    }
    fetchData()

    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setIsDropdownOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [supabase, memoId])

  const filteredCatalog = catalog.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.sku.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10);

  const addToCart = (item: CatalogItem) => {
    const existing = cart.find(c => c.id === item.id)
    if (existing) {
      setCart(cart.map(c => c.id === item.id ? { ...c, cart_qty: c.cart_qty + item.pack_size } : c))
    } else {
      setCart([...cart, { ...item, cart_qty: item.pack_size }])
    }
    setSearchTerm("")
    setIsDropdownOpen(false)
  }

  const addPaymentSplit = () => setPayments([...payments, { mode: "UPI", amount: "", date: todayDate }])
  const updatePayment = (index: number, field: "mode" | "amount" | "date", value: string) => {
    const newPayments = [...payments]
    newPayments[index][field] = value
    setPayments(newPayments)
  }
  const removePayment = (index: number) => setPayments(payments.filter((_, i) => i !== index))

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.cart_qty), 0)
  const gstTotal = isGstApplied ? cart.reduce((sum, item) => sum + ((item.price * item.cart_qty * item.gst_rate) / 100), 0) : 0
  const grandTotal = Math.round(subtotal + gstTotal - discountAmount)

  const amountPaidNumber = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const balance = grandTotal - amountPaidNumber;

  const handleUpdate = async () => {
    if (cart.length === 0) return alert("Cart is empty!")
    if (amountPaidNumber > grandTotal) return alert("Payment cannot exceed Grand Total.")

    setIsSubmitting(true)

    const payload = {
      memo_id: memoId,
      customer: { name: customerName || "Walk-in Customer", mobile: customerMobile },
      // ⚡ Included narration in payload
      memo: { memo_date: memoDate, is_gst_applied: isGstApplied, discount_value: discountAmount.toString(), total_amount: grandTotal, narration: narration },
      items: cart.map(item => ({ id: item.id, quantity: item.cart_qty, price: item.price, gst_rate: item.gst_rate })),
      payments: payments.filter(p => Number(p.amount) > 0).map(p => ({ 
        amount: Number(p.amount), 
        payment_mode: p.mode, 
        payment_date: p.date 
      }))
    }

    const { error } = await supabase.rpc('update_cash_memo_atomic', { payload })

    if (error) {
      alert("Checkout Failed: " + error.message)
      setIsSubmitting(false)
    } else {
      alert("Cash Memo Updated Successfully!")
      router.push('/cash-memo')
    }
  }

  if (isLoading) return <div className="p-20 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto"/> Loading Cash Memo...</div>

  return (
    // ⚡ Increased max-width to 7xl so side-by-side has breathing room
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
         <div className="flex items-center gap-4">
           <Link href={`/cash-memo/${memoId}`} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><ArrowLeft className="w-5 h-5"/></Link>
           <div>
             <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">Edit Cash Memo</h1>
             <p className="text-sm text-slate-500 font-medium mt-1">Modify cash memo details and items.</p>
           </div>
         </div>

         <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl">
            <Calendar className="w-5 h-5 text-slate-400 ml-2"/>
            <input type="date" value={memoDate} onChange={e => setMemoDate(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none p-1 cursor-pointer"/>
         </div>
      </div>

      {/* ⚡ NEW: Split Layout Container */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* ── LEFT COLUMN (65% Width): Customer & Cart ── */}
        <div className="w-full lg:w-[65%] flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-blue-500">
                <User className="w-5 h-5 text-slate-400"/>
                <input type="text" placeholder="Customer Name (Optional)" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full outline-none text-sm font-medium"/>
              </div>
              <div className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-blue-500">
                <span className="text-slate-400 font-bold">+91</span>
                <input type="text" placeholder="Mobile Number" value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} className="w-full outline-none text-sm font-medium"/>
              </div>
            </div>

            {/* Narration Field */}
            <div className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-blue-500">
              <FileText className="w-5 h-5 text-slate-400"/>
              <input type="text" placeholder="Narration / Notes (Optional)" value={narration} onChange={e => setNarration(e.target.value)} className="w-full outline-none text-sm font-medium"/>
            </div>

            <hr className="border-slate-100" />
            <div className="relative" ref={searchRef}>
              <div className="flex items-center gap-3 bg-blue-50 border-2 border-blue-100 rounded-xl px-4 py-3 focus-within:border-blue-500 transition-colors">
                <Search className="w-5 h-5 text-blue-500"/>
                <input type="text" placeholder="Search products by name or SKU..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} className="w-full bg-transparent outline-none text-sm font-bold placeholder:font-medium placeholder:text-blue-300 text-blue-900"/>
              </div>
              {isDropdownOpen && searchTerm.length > 0 && (
                <ul className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto overflow-x-hidden">
                  {filteredCatalog.length === 0 ? <li className="p-4 text-sm text-slate-500 text-center font-medium">No products found.</li> : (
                    filteredCatalog.map(item => (
                      <li key={item.id} className="border-b border-slate-50 last:border-0">
                        <button onClick={() => addToCart(item)} className="w-full flex items-center justify-between p-3 hover:bg-blue-50 transition-colors text-left group">
                          <div className="flex flex-col"><span className="text-sm font-bold text-slate-800">{item.name}</span><span className="text-[10px] text-slate-400 font-mono mt-0.5">{item.sku}</span></div>
                          <div className="flex flex-col items-end"><span className="text-sm font-black text-slate-700">₹{item.price}</span><span className={`text-[10px] font-bold uppercase mt-0.5 ${item.available_qty > 0 ? 'text-green-500' : 'text-red-500'}`}>{item.available_qty} in Office</span></div>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-widest text-slate-500">
                  <th className="p-4 font-black">Item</th>
                  <th className="p-4 font-black w-24">Price</th>
                  <th className="p-4 font-black w-32 text-center">Qty</th>
                  <th className="p-4 font-black w-24 text-right">Total</th>
                  <th className="p-4 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-medium text-sm">Cart is empty.</td></tr> : (
                  cart.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-4"><p className="text-sm font-bold text-slate-800">{item.name}</p></td>
                      <td className="p-4"><input type="number" value={item.price} onChange={e => setCart(cart.map(c => c.id === item.id ? { ...c, price: Number(e.target.value) } : c))} className="w-full border border-slate-200 rounded p-1 text-sm outline-none focus:border-blue-500"/></td>
                      <td className="p-4 flex justify-center items-center gap-2"><input type="number" value={item.cart_qty} min="1" onChange={e => setCart(cart.map(c => c.id === item.id ? { ...c, cart_qty: parseInt(e.target.value) || 1 } : c))} className="w-16 text-center border border-slate-200 rounded p-1 text-sm font-bold outline-none focus:border-blue-500"/></td>
                      <td className="p-4 text-right font-black text-slate-700">₹{Number((item.price * item.cart_qty).toFixed(2))}</td>
                      <td className="p-4 text-right"><button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"><Trash2 className="w-4 h-4"/></button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT COLUMN (35% Width): Payments ── */}
        <div className="w-full lg:w-[35%] flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-6">
            <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><IndianRupee className="w-5 h-5 text-green-600"/> Payment Summary</h2>

            <div className="space-y-4 text-sm font-medium text-slate-600">
              <div className="flex justify-between items-center"><span>Subtotal</span><span className="font-bold text-slate-800">₹{subtotal.toFixed(2)}</span></div>
              <div className="flex items-center justify-between border-y border-slate-100 py-4">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={isGstApplied} onChange={e => setIsGstApplied(e.target.checked)} className="w-4 h-4 rounded text-blue-600 cursor-pointer"/><span>Apply GST</span></label>
                <span className="font-bold text-slate-800">+ ₹{gstTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                 <span>Discount</span>
                 <div className="flex items-center gap-1 border border-slate-200 rounded bg-slate-50 px-2 py-1 w-24 focus-within:border-blue-500"><span className="text-slate-400">₹</span><input type="number" value={discountAmount} onChange={e => setDiscountAmount(Number(e.target.value))} className="w-full bg-transparent outline-none text-right font-bold text-slate-800"/></div>
              </div>
              <div className="bg-slate-900 rounded-xl p-4 mt-6 text-white flex justify-between items-center shadow-md">
                <span className="font-bold text-slate-300 uppercase tracking-widest text-xs">Grand Total</span>
                <span className="text-3xl font-black">₹{grandTotal}</span>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Received Payments</label>
                <button onClick={addPaymentSplit} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus className="w-3 h-3"/> Split Payment</button>
              </div>

              {payments.map((payment, index) => (
                <div key={index} className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <select value={payment.mode} onChange={(e) => updatePayment(index, "mode", e.target.value)} className="w-1/2 bg-white border border-slate-200 text-sm font-bold text-slate-700 rounded-lg p-2 outline-none focus:border-blue-500">
                      <option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Bank">Bank</option>
                    </select>
                    <input type="date" value={payment.date} onChange={(e) => updatePayment(index, "date", e.target.value)} className="w-1/2 bg-white border border-slate-200 text-sm font-bold text-slate-700 rounded-lg p-2 outline-none focus:border-blue-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-blue-500">
                      <IndianRupee className="w-4 h-4 text-slate-400"/>
                      <input type="number" placeholder="Amount" value={payment.amount} onChange={(e) => updatePayment(index, "amount", e.target.value)} className="w-full bg-transparent outline-none text-sm font-black text-slate-800"/>
                    </div>
                    {payments.length > 1 && (
                      <button onClick={() => removePayment(index)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                    )}
                  </div>
                </div>
              ))}

              <div className={`flex justify-between items-center p-3 mt-4 rounded-xl border font-bold text-sm ${balance > 0 ? 'bg-orange-50 border-orange-200 text-orange-800' : balance < 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                 <span>Balance Remaining:</span><span>₹{balance}</span>
              </div>
              
              <button onClick={handleUpdate} disabled={isSubmitting || cart.length === 0} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black py-4 rounded-xl shadow-md transition-all flex justify-center items-center gap-2">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} Update Cash Memo
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}