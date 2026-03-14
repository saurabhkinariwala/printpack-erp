"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Plus, Trash2, Save, User, MapPin, Receipt, Truck, CreditCard, Search, Image as ImageIcon, X, Layers, Minus, Calendar, Hash, Star } from "lucide-react"

const INDIAN_STATES = [
  "Maharashtra", "Andhra Pradesh", "Karnataka", "Tamil Nadu", "Telangana", "Kerala",
  "Gujarat", "Rajasthan", "Madhya Pradesh", "Delhi", "Uttar Pradesh", "West Bengal",
  "Bihar", "Punjab", "Haryana", "Odisha", "Assam", "Goa", "Other"
];

export default function NewOrderPage() {
  const router = useRouter()
  const supabase = createClient()

  // --- CORE STATE ---
  const [orderNo, setOrderNo] = useState("Loading...")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])

  // CUSTOMER STATE
  const [customerInfo, setCustomerInfo] = useState({ name: "", mobile: "", city: "", address: "", state: "Maharashtra", gst: "", is_favorite: false })
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [deliveryInfo, setDeliveryInfo] = useState({ mode: "Self Pickup", transporter: "" })
  const defaultPayment = () => ({ amount: "", mode: "Cash", reference: "", date: new Date().toISOString().split('T')[0] });
  const [paymentRecords, setPaymentRecords] = useState([defaultPayment()]);
  const [discountInput, setDiscountInput] = useState("")
  const [orderItems, setOrderItems] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Catalog State
  const [isCatalogOpen, setIsCatalogOpen] = useState(false)
  const [catalogItems, setCatalogItems] = useState<any[]>([])
  const [pendingQtys, setPendingQtys] = useState<Record<string, number>>({})
  const [catalogSearch, setCatalogSearch] = useState("")
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false)

  // 1. Fetch Next Order Number
  // 1. Fetch Next Order Number (FIXED: Sorting by order_number instead of created_at)
  useEffect(() => {
    async function fetchNextOrderNo() {
      const { data } = await supabase
        .from('orders')
        .select('order_number')
        .order('order_number', { ascending: false }) // This guarantees we get the absolute highest ORD- number
        .limit(1)
        .maybeSingle();

      if (data && data.order_number) {
        const match = data.order_number.match(/\d+$/);
        if (match) setOrderNo(`ORD-${String(parseInt(match[0]) + 1).padStart(4, '0')}`);
        else setOrderNo(`ORD-${Date.now().toString().slice(-4)}`);
      } else {
        setOrderNo("ORD-0001");
      }
    }
    fetchNextOrderNo();
  }, [supabase]);

  // 2. VIP/FAVORITE CUSTOMER AUTOCOMPLETE ONLY
  useEffect(() => {
    const searchTerms = customerInfo.mobile.length >= 3 ? customerInfo.mobile : (customerInfo.name.length >= 3 ? customerInfo.name : "");
    if (!searchTerms) {
      setCustomerSuggestions([]);
      return;
    }
    const delay = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('is_favorite', true) // STRICT FIX: Only fetch favorites
        .or(`mobile.ilike.%${searchTerms}%,name.ilike.%${searchTerms}%`)
        .limit(5);
      if (data) setCustomerSuggestions(data);
    }, 300);
    return () => clearTimeout(delay);
  }, [customerInfo.mobile, customerInfo.name, supabase]);

  const selectCustomer = (c: any) => {
    setCustomerInfo({
      name: c.name, mobile: c.mobile, city: c.city || "", address: c.billing_address || "",
      state: c.state || "Maharashtra", gst: c.gst_number || "", is_favorite: c.is_favorite || true
    });
    setShowSuggestions(false);
  }

  // --- CATALOG LOGIC ---
  const openCatalog = async () => {
    setIsCatalogOpen(true);
    if (catalogItems.length > 0) return;
    setIsLoadingCatalog(true);
    const { data: itemsData } = await supabase.from('items').select(`id, name, sku, price, gst_rate, image_path, pack_size, sub_categories(name), sub_sub_categories(name), stock(quantity, locations(name))`);
    const { data: orderData } = await supabase.from('order_items').select(`item_id, quantity_ordered, orders!inner(status), dispatch_items(quantity_dispatched)`).neq('orders.status', 'Completed');
    const pendingMap: Record<string, number> = {};
    if (orderData) {
      orderData.forEach((row: any) => {
        const dispatched = row.dispatch_items?.reduce((sum: number, di: any) => sum + di.quantity_dispatched, 0) || 0;
        const pending = row.quantity_ordered - dispatched;
        if (pending > 0) pendingMap[row.item_id] = (pendingMap[row.item_id] || 0) + pending;
      });
    }
    setPendingQtys(pendingMap);
    if (itemsData) setCatalogItems(itemsData);
    setIsLoadingCatalog(false);
  }

  const filteredCatalog = catalogItems.filter(item => `${item.sub_categories?.name} ${item.sub_sub_categories?.name} ${item.name} ${item.sku}`.toLowerCase().includes(catalogSearch.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const handleCatalogAdd = (item: any) => {
    const packSize = item.pack_size || 10;
    const existing = orderItems.find(i => i.item_id === item.id);
    if (existing) updateItem(item.id, 'qty', existing.qty + packSize);
    else setOrderItems([...orderItems, { item_id: item.id, name: item.name, sku: item.sku, price: item.price, qty: packSize, gst_rate: item.gst_rate || 0, pack_size: packSize, path: `${item.sub_categories?.name || ''} › ${item.sub_sub_categories?.name || 'Standard'}` }]);
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
  let cgstTotal = 0; let sgstTotal = 0; let igstTotal = 0;

  orderItems.forEach(item => {
    const itemTaxable = (item.price * item.qty) - ((item.price * item.qty) * discountFraction);
    if (customerInfo.state === "Maharashtra") {
      cgstTotal += itemTaxable * ((item.gst_rate / 2) / 100);
      sgstTotal += itemTaxable * ((item.gst_rate / 2) / 100);
    } else {
      igstTotal += itemTaxable * (item.gst_rate / 100);
    }
  });

  const grandTotal = taxableAmount + cgstTotal + sgstTotal + igstTotal;
  const roundedTotal = Math.round(grandTotal);
  const totalPaid = paymentRecords.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const balanceDue = Math.max(0, roundedTotal - totalPaid);

  // --- SAVE LOGIC ---
  const handleSaveOrder = async () => {
    if (!customerInfo.name || !customerInfo.mobile) return alert("Customer Name and Mobile are required.")
    if (orderItems.length === 0) return alert("Add at least one item to the order.")
    if (!orderNo) return alert("Order Number is required.")
    setIsSaving(true)

    let customerId = null
    const { data: existingCustomer } = await supabase.from('customers').select('id').eq('mobile', customerInfo.mobile).maybeSingle()
    if (existingCustomer) {
      customerId = existingCustomer.id
      await supabase.from('customers').update({
        name: customerInfo.name, city: customerInfo.city, billing_address: customerInfo.address,
        state: customerInfo.state, gst_number: customerInfo.gst, is_favorite: customerInfo.is_favorite
      }).eq('id', customerId)
    } else {
      const { data: newCustomer } = await supabase.from('customers').insert([{
        name: customerInfo.name, mobile: customerInfo.mobile, city: customerInfo.city,
        billing_address: customerInfo.address, state: customerInfo.state, gst_number: customerInfo.gst, is_favorite: customerInfo.is_favorite
      }]).select().single()
      customerId = newCustomer?.id
    }

    const { data: newOrder, error: orderError } = await supabase.from('orders').insert([{
      order_number: orderNo, created_at: new Date(orderDate).toISOString(), customer_id: customerId,
      status: 'Pending', total_amount: roundedTotal, discount_value: discountInput,
      transport_mode: deliveryInfo.mode, transporter_name: deliveryInfo.mode === 'Transporter' ? deliveryInfo.transporter : null
    }]).select().single()

    if (orderError) { alert("Error saving order: " + orderError.message); setIsSaving(false); return; }

    const itemsPayload = orderItems.map(item => ({ order_id: newOrder.id, item_id: item.item_id, quantity_ordered: item.qty, unit_price: item.price }))
    await supabase.from('order_items').insert(itemsPayload)

    const validPayments = paymentRecords.filter(p => p.amount && Number(p.amount) > 0);
    if (validPayments.length > 0) {
      const paymentsPayload = validPayments.map(p => ({
        order_id: newOrder.id, amount: Number(p.amount), payment_mode: p.mode, transaction_reference: p.reference, created_at: new Date(p.date).toISOString()
      }));
      
      const { error: paymentError } = await supabase.from('payments').insert(paymentsPayload);
      
      if (paymentError) {
        alert("Order saved, but payment failed to record: " + paymentError.message);
        console.error("Payment Error Details:", paymentError);
      }
    }

    alert("Order Created Successfully!")
    router.push(`/orders/${newOrder.id}`)
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">

      {/* HEADER WITH ORDER NO & DATE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-6">
          <div><h2 className="text-2xl font-bold text-slate-800">Create New Order</h2><p className="text-sm text-slate-500">Record a new sale, process split payments, and allocate stock.</p></div>
          <div className="hidden md:flex gap-4 border-l border-slate-200 pl-6 ml-2">
            <div><label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Hash className="w-3 h-3" /> Order No</label><input type="text" value={orderNo} onChange={e => setOrderNo(e.target.value)} className="w-28 p-1.5 mt-1 border border-slate-300 rounded outline-none focus:border-blue-500 font-bold text-slate-800 text-sm" /></div>
            <div><label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Calendar className="w-3 h-3" /> Date</label><input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="w-36 p-1.5 mt-1 border border-slate-300 rounded outline-none focus:border-blue-500 text-sm font-medium text-slate-700" /></div>
          </div>
        </div>
        <button onClick={handleSaveOrder} disabled={isSaving || orderItems.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg shadow font-bold flex items-center justify-center gap-2 disabled:opacity-50 w-full md:w-auto">
          <Save className="w-5 h-5" /> {isSaving ? "Saving..." : "Save Complete Order"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* SMART CUSTOMER DETAILS */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><User className="w-4 h-4 text-blue-600" /> Customer Details</h3>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors">
                <input type="checkbox" checked={customerInfo.is_favorite} onChange={e => setCustomerInfo({ ...customerInfo, is_favorite: e.target.checked })} className="w-4 h-4 accent-amber-600 cursor-pointer" />
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" /> Regular / VIP
              </label>
            </div>

            <div className="grid grid-cols-12 gap-4 relative">
              <div className="col-span-12 md:col-span-6">
                <label className="text-xs font-bold text-slate-500 uppercase">Customer Name *</label>
                <input type="text" value={customerInfo.name} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Type to search or add new..." />
              </div>
              <div className="col-span-12 md:col-span-6">
                <label className="text-xs font-bold text-slate-500 uppercase">Mobile Number *</label>
                <input type="text" value={customerInfo.mobile} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} onChange={e => setCustomerInfo({ ...customerInfo, mobile: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Type to search or add new..." />
              </div>


              {/* VIP AUTOCOMPLETE DROPDOWN */}
              {showSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute top-[70px] left-0 w-full bg-white border border-slate-200 rounded-xl shadow-2xl z-20 overflow-hidden flex flex-col">
                  <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-amber-700 uppercase flex items-center gap-1.5"><Star className="w-3 h-3 fill-amber-500 text-amber-500" /> VIP Matches Found</span>
                    <button onMouseDown={(e) => { e.preventDefault(); setShowSuggestions(false); }} className="text-xs font-bold text-blue-600 hover:underline">Ignore & Add New Customer</button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {customerSuggestions.map(c => (
                      <div key={c.id} onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }} className="p-3 hover:bg-slate-50 cursor-pointer flex justify-between items-center group transition-colors">
                        <div>
                          <p className="font-bold text-slate-800">{c.name}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{c.mobile} | {c.city || 'No City'}</p>
                        </div>
                        <span className="text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Select VIP</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="col-span-12 md:col-span-4"><label className="text-xs font-bold text-slate-500 uppercase">City</label><input type="text" value={customerInfo.city} onChange={e => setCustomerInfo({ ...customerInfo, city: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:border-blue-500" placeholder="e.g. Mumbai" /></div>
              <div className="col-span-12 md:col-span-4"><label className="text-xs font-bold text-slate-500 uppercase">Address</label><input type="text" value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:border-blue-500" placeholder="Street" /></div>
              <div className="col-span-12 md:col-span-4"><label className="text-xs font-bold text-slate-500 uppercase">State</label><select value={customerInfo.state} onChange={e => setCustomerInfo({ ...customerInfo, state: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:border-blue-500 bg-white">{INDIAN_STATES.map(state => <option key={state} value={state}>{state}</option>)}</select></div>
              <div className="col-span-12"><label className="text-xs font-bold text-slate-500 uppercase">GSTIN (Optional)</label><input type="text" value={customerInfo.gst} onChange={e => setCustomerInfo({ ...customerInfo, gst: e.target.value.toUpperCase() })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:border-blue-500 font-mono text-sm" placeholder="27XXXXX1234X1Z5" /></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Truck className="w-4 h-4 text-green-600" /> Delivery Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Transport Mode</label>
                <select value={deliveryInfo.mode} onChange={e => setDeliveryInfo({ ...deliveryInfo, mode: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:border-blue-500 bg-white">
                  <option value="Self Pickup">Self Pickup</option><option value="Transporter">Through Transporter</option>
                </select>
              </div>
              {deliveryInfo.mode === "Transporter" && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Transporter Name</label>
                  <input type="text" value={deliveryInfo.transporter} onChange={e => setDeliveryInfo({ ...deliveryInfo, transporter: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-md outline-none focus:border-blue-500" placeholder="e.g. VRL Logistics" />
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers className="w-4 h-4 text-blue-600" /> Order Items</h3>
              <button onClick={openCatalog} className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm">
                <Search className="w-4 h-4" /> Browse Catalog
              </button>
            </div>

            {orderItems.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-y border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-3 px-4">Item</th><th className="py-3 px-4 w-24">Price</th><th className="py-3 px-4 w-24">Qty</th><th className="py-3 px-4 text-center">GST</th><th className="py-3 px-4 text-right">Total</th><th className="py-3 px-4 text-center"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orderItems.map((item) => (
                    <tr key={item.item_id}>
                      <td className="py-3 px-4"><div className="font-bold text-slate-800">{item.name}</div><div className="text-[10px] text-blue-600 font-semibold uppercase">{item.path}</div></td>
                      <td className="py-3 px-4"><input type="number" value={item.price} onChange={e => updateItem(item.item_id, 'price', Number(e.target.value))} className="w-full p-1.5 border border-slate-300 rounded outline-none focus:border-blue-500" /></td>
                      <td className="py-3 px-4"><input type="number" min="1" value={item.qty} onChange={e => updateItem(item.item_id, 'qty', Number(e.target.value))} className="w-full p-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 text-center font-bold" /></td>
                      <td className="py-3 px-4 text-center text-slate-500 font-medium">{item.gst_rate}%</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-700">₹{(item.price * item.qty).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center"><button onClick={() => removeItem(item.item_id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg"><p className="text-slate-500 font-medium mb-3">No items in this order yet.</p><button onClick={openCatalog} className="bg-white border border-slate-300 text-slate-700 px-6 py-2 rounded shadow-sm text-sm font-bold hover:bg-slate-100">Click to add products</button></div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><Receipt className="w-4 h-4 text-blue-600" /> Financial Summary</h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Subtotal</span><span className="font-bold text-slate-800">₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-500 font-medium pt-1">Discount</span>
                <div className="flex items-center gap-2">
                  <input type="text" value={discountInput} onChange={e => setDiscountInput(e.target.value)} placeholder="20% or 500" className="w-24 p-1.5 text-right border border-slate-300 rounded outline-none focus:border-blue-500 text-xs font-bold text-red-600" />
                  {discountAmt > 0 && <span className="text-red-600 font-bold">- ₹{discountAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>}
                </div>
              </div>
              <div className="flex justify-between items-center"><span className="text-slate-700 font-bold">Taxable Amount</span><span className="font-bold text-slate-800">₹{taxableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              {customerInfo.state === "Maharashtra" ? (
                <><div className="flex justify-between items-center text-slate-500"><span>CGST</span><span>+ ₹{cgstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div><div className="flex justify-between items-center text-slate-500 pb-4 border-b border-slate-100"><span>SGST</span><span>+ ₹{sgstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div></>
              ) : (
                <div className="flex justify-between items-center text-slate-500 pb-4 border-b border-slate-100"><span>IGST</span><span>+ ₹{igstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              )}
              <div className="flex justify-between items-center pt-2"><span className="text-lg font-black text-slate-800">Grand Total</span><span className="text-2xl font-black text-blue-600">₹{roundedTotal.toLocaleString()}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-green-600" /> Initial Payments</h3><button onClick={addPaymentRow} className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Split</button></div>
            <div className="space-y-4">
              {paymentRecords.map((payment, index) => (
                <div key={index} className="p-3 bg-slate-50 border border-slate-200 rounded-lg relative">
                  {paymentRecords.length > 1 && <button onClick={() => removePaymentRow(index)} className="absolute -top-2 -right-2 bg-white border border-slate-200 text-red-500 rounded-full p-1 hover:bg-red-50"><X className="w-3 h-3" /></button>}
                  <div className="flex gap-2 mb-2">
                    <div className="w-1/2"><label className="text-[10px] font-bold text-slate-500 uppercase">Amount (₹)</label><input type="number" value={payment.amount} onChange={e => updatePaymentRow(index, 'amount', e.target.value)} className="w-full p-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 font-bold text-green-700 text-sm" placeholder="0.00" /></div>
                    <div className="w-1/2"><label className="text-[10px] font-bold text-slate-500 uppercase">Mode</label><select value={payment.mode} onChange={e => updatePaymentRow(index, 'mode', e.target.value)} className="w-full p-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 bg-white text-sm"><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="UPI">UPI</option></select></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-1/2"><label className="text-[10px] font-bold text-slate-500 uppercase">Ref / Note</label><input type="text" value={payment.reference} onChange={e => updatePaymentRow(index, 'reference', e.target.value)} className="w-full p-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 text-xs" placeholder="Txn ID..." /></div>
                    <div className="w-1/2"><label className="text-[10px] font-bold text-slate-500 uppercase">Date</label><input type="date" value={payment.date} onChange={e => updatePaymentRow(index, 'date', e.target.value)} className="w-full p-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 text-xs" /></div>
                  </div>
                </div>
              ))}
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-500 uppercase">Total Collected</span><span className="font-bold text-green-700">₹{totalPaid.toLocaleString()}</span></div>
                <div className="flex justify-between items-center p-2 bg-orange-50 rounded-lg border border-orange-100"><span className="text-xs font-bold text-orange-800 uppercase">Balance Due</span><span className="font-black text-orange-600 text-lg">₹{balanceDue.toLocaleString()}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CATALOG MODAL */}
      {isCatalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
          <div className="bg-slate-50 w-full max-w-7xl h-full rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-white p-5 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div><h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Search className="w-6 h-6 text-blue-600" /> Master Catalog Browser</h2></div>
              <button onClick={() => setIsCatalogOpen(false)} className="p-2 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="bg-white p-4 border-b border-slate-200 shrink-0"><input type="text" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Type to search e.g. 'Dry Fruit 400gm d-1'..." className="w-full p-3 border-2 border-blue-100 rounded-xl outline-none focus:border-blue-500 text-lg font-medium shadow-sm" autoFocus /></div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
              {isLoadingCatalog ? (<div className="flex h-full items-center justify-center text-slate-400 font-bold text-lg">Loading Master Catalog...</div>) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                  {filteredCatalog.map(item => {
                    let totalAct = 0; let remainingPending = pendingQtys[item.id] || 0; let totalAvl = 0;
                    item.stock?.forEach((s: any) => { totalAct += s.quantity; const locDeduction = Math.min(s.quantity, remainingPending); remainingPending -= locDeduction; totalAvl += (s.quantity - locDeduction); });
                    const cartItem = orderItems.find(i => i.item_id === item.id);
                    const packSize = item.pack_size || 10;
                    return (
                      <div key={item.id} className={`bg-white border-2 rounded-xl overflow-hidden flex flex-col transition-all ${cartItem ? 'border-blue-500 shadow-md ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}>
                        <div className="h-40 w-full bg-slate-100 relative">
                          {item.image_path ? ( /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.image_path} alt={item.name} className="h-full w-full object-cover" />) : <div className="h-full w-full flex items-center justify-center"><ImageIcon className="w-10 h-10 text-slate-300" /></div>}
                          <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded">Pack of {packSize}</div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <p className="text-[10px] font-bold text-blue-600 uppercase mb-1 leading-tight">{item.sub_categories?.name || 'Uncategorized'} › {item.sub_sub_categories?.name || 'Standard'}</p>
                          <div className="flex justify-between items-start gap-2 mb-1"><h4 className="font-bold text-slate-800 leading-tight">{item.name}</h4><span className="font-black text-slate-800">₹{item.price}</span></div>
                          <p className="text-xs text-slate-400 font-mono mb-3">{item.sku}</p>
                          <div className="flex gap-3 text-xs font-mono mt-auto"><span className="text-slate-500">ACT:{totalAct}</span><span className={`font-bold ${totalAvl > 0 ? 'text-green-600' : 'text-red-500'}`}>AVL:{totalAvl}</span></div>
                        </div>
                        <div className="p-3 bg-slate-50 border-t border-slate-100">
                          {cartItem ? (
                            <div className="flex items-center justify-between bg-blue-50 rounded-lg p-1 border border-blue-200">
                              <button onClick={() => handleCatalogRemove(item)} className="p-2 bg-white rounded shadow-sm text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"><Minus className="w-4 h-4" /></button>
                              <div className="flex flex-col items-center"><span className="font-black text-blue-800">{cartItem.qty} <span className="text-xs font-semibold">Qty</span></span></div>
                              <button onClick={() => handleCatalogAdd(item)} className="p-2 bg-white rounded shadow-sm text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"><Plus className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => handleCatalogAdd(item)} className="w-full py-2 bg-white border border-slate-300 hover:border-blue-500 hover:bg-blue-50 text-slate-700 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add to Order</button>
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