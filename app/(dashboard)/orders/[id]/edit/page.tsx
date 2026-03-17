"use client"

import { useState, useEffect, use, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Save, Loader2, User, Truck, Layers, Receipt, Plus, Trash2, History, Search, X, CreditCard, CheckCircle, ImageIcon, Minus } from "lucide-react"
import { usePermissions } from "@/hooks/usePermissions"

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const orderId = resolvedParams.id
  const router = useRouter()
  const supabase = createClient()

  const { isCategoryAllowed } = usePermissions()

  // ⚡ THE FIX: This lock prevents React from constantly overwriting your cart
  const hasLoadedData = useRef(false)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  const [originalOrder, setOriginalOrder] = useState<any>(null)
  const [currentVersionNumber, setCurrentVersionNumber] = useState(1)

  const [customer, setCustomer] = useState({ id: "", name: "", mobile: "", billing_address: "", city: "", state: "Maharashtra", gst_number: "" })
  const [transportMode, setTransportMode] = useState("Transporter")
  const [transporterName, setTransporterName] = useState("")
  const [discount, setDiscount] = useState("0")
  const [cart, setCart] = useState<any[]>([])
  
  const [catalog, setCatalog] = useState<any[]>([])
  const [isCatalogOpen, setIsCatalogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [pendingQtys, setPendingQtys] = useState<Record<string, number>>({})

  useEffect(() => {
    // If we have already loaded the data from the DB, abort immediately so we don't overwrite user edits!
    if (hasLoadedData.current) return;

    async function loadData() {
      // Lock the gate so this only runs once
      hasLoadedData.current = true;

      // 1. Fetch Full Catalog
      const { data: itemsData } = await supabase.from('items').select(`
        id, name, sku, price, gst_rate, image_path, pack_size,
        sub_categories(name, categories(name)),
        sub_sub_categories(name),
        stock(quantity, locations(name))
      `);

      if (itemsData) {
        const permitted = itemsData.filter((item: any) =>
          isCategoryAllowed(item.sub_categories?.categories?.name)
        );
        setCatalog(permitted);
      }

      // 2. Fetch Order Data
      const { data: orderData, error } = await supabase.from('orders').select(`
        *,
        customers ( id, name, mobile, billing_address, city, state, gst_number ),
        order_items ( id, item_id, quantity_ordered, unit_price, items ( name, sku, image_path, gst_rate, sub_categories(name), sub_sub_categories(name) ) ),
        payments (*)
      `).eq('id', orderId).single();

      if (error || !orderData) return alert("Could not load order");

      setOriginalOrder(orderData);

      const { data: vData } = await supabase.from('order_versions').select('version_number').eq('order_id', orderId).order('version_number', { ascending: false }).limit(1);
      if (vData && vData.length > 0) setCurrentVersionNumber(vData[0].version_number);

      if (orderData.customers) setCustomer(orderData.customers);
      setTransportMode(orderData.transport_mode || "Transporter");
      setTransporterName(orderData.transporter_name || "");
      setDiscount(orderData.discount_value || "0");

      // 3. Build Cart Safely
      const existingCart = orderData.order_items.map((oi: any) => ({
        id: oi.item_id, 
        name: oi.items?.name || 'Unknown', 
        sku: oi.items?.sku || '', 
        gst_rate: oi.items?.gst_rate || 0, 
        price: oi.unit_price, 
        quantity: oi.quantity_ordered,
        image_path: oi.items?.image_path || null,
        path: `${oi.items?.sub_categories?.name || ''} › ${oi.items?.sub_sub_categories?.name || 'Standard'}`
      }));
      setCart(existingCart);
      setIsLoading(false);
    }
    loadData();
  }, [supabase, orderId, isCategoryAllowed]);

  const handleQuantityChange = (id: string, qty: number) => { setCart(cart.map(item => item.id === id ? { ...item, quantity: Math.max(1, qty) } : item)); };
  const handlePriceChange = (id: string, price: number) => { setCart(cart.map(item => item.id === id ? { ...item, price: Math.max(0, price) } : item)); };
  const removeItem = (id: string) => { setCart(cart.filter(item => item.id !== id)); };

  const handleAddItemToCart = (selectedItem: any) => {
    const packSize = selectedItem.pack_size || 10;
    const existing = cart.find(i => i.id === selectedItem.id);
    
    if (existing) {
      handleQuantityChange(selectedItem.id, existing.quantity + packSize);
    } else {
      setCart([...cart, { 
        id: selectedItem.id, 
        name: selectedItem.name, 
        sku: selectedItem.sku, 
        gst_rate: selectedItem.gst_rate, 
        price: selectedItem.price || 0, 
        quantity: packSize,
        image_path: selectedItem.image_path || null,
        path: `${selectedItem.sub_categories?.name || ''} › ${selectedItem.sub_sub_categories?.name || 'Standard'}`
      }]);
    }
  };

  const handleCatalogRemove = (selectedItem: any) => {
    const packSize = selectedItem.pack_size || 10;
    const existing = cart.find(i => i.id === selectedItem.id);
    if (!existing) return;
    if (existing.quantity <= packSize) removeItem(selectedItem.id);
    else handleQuantityChange(selectedItem.id, existing.quantity - packSize);
  }

  // --- FINANCIAL MATH ENGINE ---
  let subtotal = 0;
  cart.forEach(item => subtotal += (item.price * item.quantity));
  let discountAmt = 0;
  const cleanDiscount = String(discount).replace('-', '').trim();
  if (cleanDiscount.includes('%')) { const pct = parseFloat(cleanDiscount.replace('%', '')); if (!isNaN(pct)) discountAmt = subtotal * (pct / 100); } 
  else { discountAmt = parseFloat(cleanDiscount) || 0; }
  
  const taxableAmount = Math.max(0, subtotal - discountAmt);
  const discountFraction = subtotal > 0 ? discountAmt / subtotal : 0;
  let cgstTotal = 0; let sgstTotal = 0; let igstTotal = 0;

  cart.forEach(item => {
    const itemTaxable = (item.price * item.quantity) * (1 - discountFraction);
    const rate = item.gst_rate || 0;
    if (customer.state === "Maharashtra") { cgstTotal += itemTaxable * ((rate / 2) / 100); sgstTotal += itemTaxable * ((rate / 2) / 100); } 
    else { igstTotal += itemTaxable * (rate / 100); }
  });

  const grandTotal = Math.round(taxableAmount + cgstTotal + sgstTotal + igstTotal);
  const totalPaid = originalOrder?.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
  const balanceDue = Math.max(0, grandTotal - totalPaid);

  const syncOrderStatus = async () => {
    const { data: latestOrder } = await supabase.from('orders').select(`
      total_amount, order_items ( quantity_ordered ), dispatch_notes ( dispatch_items ( quantity_dispatched ) ), payments ( amount )
    `).eq('id', orderId).single();

    if (!latestOrder) return;

    let totalOrdered = 0; let totalDispatched = 0;
    latestOrder.order_items?.forEach((i: any) => totalOrdered += i.quantity_ordered || 0);
    latestOrder.dispatch_notes?.forEach((n: any) => n.dispatch_items?.forEach((di: any) => totalDispatched += di.quantity_dispatched || 0));

    const totalPaidCurrent = latestOrder.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
    const balanceCurrent = Math.max(0, latestOrder.total_amount - totalPaidCurrent);

    let newStatus = 'Pending';
    
    if (totalOrdered > 0) {
      if (totalDispatched === 0) {
        newStatus = 'Pending';
      } else if (totalDispatched > 0 && totalDispatched < totalOrdered) {
        newStatus = 'Partial';
      } else if (totalDispatched >= totalOrdered) {
        if (balanceCurrent <= 0) {
          newStatus = 'Completed';
        } else {
          newStatus = 'On Credit';
        }
      }
    }

    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
  }

  const handleUpdateOrder = async () => {
    if (cart.length === 0) return alert("Order must have at least one item.");
    if (!customer.name || !customer.mobile) return alert("Customer Name and Mobile are required.");
    
    setIsSaving(true);

    try {
      await supabase.from('order_versions').insert([{ order_id: orderId, version_number: currentVersionNumber, snapshot_data: originalOrder }]);
      if (customer.id) {
        await supabase.from('customers').update({
          name: customer.name, mobile: customer.mobile, billing_address: customer.billing_address, city: customer.city, state: customer.state, gst_number: customer.gst_number
        }).eq('id', customer.id);
      }

      await supabase.from('orders').update({
        transport_mode: transportMode, transporter_name: transporterName, discount_value: discount, total_amount: grandTotal
      }).eq('id', orderId);

      await supabase.from('order_items').delete().eq('order_id', orderId);
      
      const newItemsPayload = cart.map(item => ({ order_id: orderId, item_id: item.id, quantity_ordered: item.quantity, unit_price: item.price }));
      await supabase.from('order_items').insert(newItemsPayload);

      await syncOrderStatus();
      router.push(`/orders/${orderId}`);
      
    } catch (err: any) {
      alert("Save failed: " + err.message);
      setIsSaving(false);
    }
  };

  const filteredCatalog = catalog.filter(item => {
    const searchString = `${item.sub_categories?.name || ''} ${item.sub_sub_categories?.name || ''} ${item.name || ''} ${item.sku || ''}`.toLowerCase();
    return searchString.includes(searchTerm.toLowerCase());
  }).sort((a, b) => a.name.localeCompare(b.name));

  if (isLoading) return <div className="p-20 text-center font-bold text-slate-500 flex justify-center items-center gap-2"><Loader2 className="w-5 h-5 animate-spin"/> Loading Order Sandbox...</div>;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">
      
      <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl flex items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><History className="w-5 h-5 text-purple-700"/></div>
          <div><h3 className="font-bold text-purple-900">Version Control Active</h3><p className="text-xs text-purple-700 mt-0.5">You are currently editing <strong>Version {currentVersionNumber}</strong>. Saving these changes will securely archive the old data and create <strong>Version {currentVersionNumber + 1}</strong>.</p></div>
        </div>
      </div>

      <div className="flex items-center justify-between bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600"><ArrowLeft className="w-5 h-5"/></button>
          <div><h1 className="text-xl font-bold text-slate-800">Edit Order: {originalOrder?.order_number}</h1><p className="text-xs text-slate-500 font-medium mt-1">Make changes to customer, delivery, or items below.</p></div>
        </div>
        <button onClick={handleUpdateOrder} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow font-bold flex items-center gap-2 disabled:opacity-50 transition-all">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} Save New Version
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2"><User className="w-5 h-5 text-blue-600"/> Edit Customer Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-[10px] font-bold text-slate-500 uppercase">Full Name</label><input type="text" value={customer.name} onChange={e=>setCustomer({...customer, name: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase">Mobile Number</label><input type="text" value={customer.mobile} onChange={e=>setCustomer({...customer, mobile: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono" /></div>
              <div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-500 uppercase">Billing Address</label><input type="text" value={customer.billing_address} onChange={e=>setCustomer({...customer, billing_address: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase">City</label><input type="text" value={customer.city} onChange={e=>setCustomer({...customer, city: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">State</label>
                <select value={customer.state} onChange={e=>setCustomer({...customer, state: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="Maharashtra">Maharashtra (CGST/SGST)</option><option value="Gujarat">Gujarat (IGST)</option><option value="Delhi">Delhi (IGST)</option><option value="Karnataka">Karnataka (IGST)</option><option value="Other">Other State (IGST)</option>
                </select>
              </div>
              <div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-500 uppercase">GST Number</label><input type="text" value={customer.gst_number} onChange={e=>setCustomer({...customer, gst_number: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase" placeholder="Unregistered" /></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2"><Truck className="w-5 h-5 text-green-600"/> Edit Delivery Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Transport Mode</label>
                <select value={transportMode} onChange={e=>setTransportMode(e.target.value)} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="Transporter">Transporter</option><option value="Self Pickup">Self Pickup</option>
                </select>
              </div>
              {transportMode === 'Transporter' && (
                <div><label className="text-[10px] font-bold text-slate-500 uppercase">Transporter Name</label><input type="text" value={transporterName} onChange={e=>setTransporterName(e.target.value)} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" /></div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers className="w-5 h-5 text-purple-600"/> Edit Ordered Items</h3>
              <button onClick={() => setIsCatalogOpen(true)} className="w-full md:w-auto px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-blue-700 hover:bg-slate-50 hover:border-blue-300 transition-colors flex items-center justify-center gap-2 shadow-sm"><Search className="w-4 h-4" /> Browse Catalog</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                  <tr><th className="p-4">Product Details</th><th className="p-4 w-28 text-center">Price (₹)</th><th className="p-4 w-28 text-center">Qty</th><th className="p-4 w-28 text-right">Total</th><th className="p-4 w-12 text-center"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cart.map((item, idx) => (
                    // ⚡ THE FIX: Safe combination key prevents duplicate crashing!
                    <tr key={`cart-${item.id}-${idx}`} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-slate-100 rounded-md border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                            {item.image_path ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image_path} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{item.name}</p>
                            <p className="text-[10px] font-mono text-slate-400 mt-1">{item.sku} • {item.gst_rate}% GST</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center"><input type="number" value={item.price} onChange={(e) => handlePriceChange(item.id, Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono text-sm" /></td>
                      <td className="p-4 text-center"><input type="number" min="1" value={item.quantity} onChange={(e) => handleQuantityChange(item.id, Number(e.target.value))} className="w-full p-2 border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-sm bg-blue-50 text-blue-900" /></td>
                      <td className="p-4 text-right font-black text-slate-800">₹{(item.price * item.quantity).toLocaleString()}</td>
                      <td className="p-4 text-center"><button onClick={() => removeItem(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button></td>
                    </tr>
                  ))}
                  {cart.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-slate-400">No items in order. Browse the catalog to add products.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 self-start w-full">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2"><Receipt className="w-5 h-5 text-blue-600"/> Live Financials</h3>
            <div className="mb-6"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Apply Discount (Flat ₹ or %)</label><input type="text" value={discount} onChange={e=>setDiscount(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-mono font-bold text-lg text-slate-700 bg-slate-50" placeholder="e.g. 500 or 10%" /></div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Subtotal</span><span className="font-bold text-slate-800">₹{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
              {discountAmt > 0 && <div className="flex justify-between items-center pb-3 border-b border-slate-100"><span className="text-slate-500 font-medium">Discount</span><span className="text-red-600 font-bold">- ₹{discountAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>}
              <div className="flex justify-between items-center"><span className="text-slate-700 font-bold">Taxable Amount</span><span className="font-bold text-slate-800">₹{taxableAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
              {customer.state === "Maharashtra" ? (
                <><div className="flex justify-between items-center text-slate-500"><span>CGST</span><span>+ ₹{cgstTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div><div className="flex justify-between items-center text-slate-500 pb-3 border-b border-slate-100"><span>SGST</span><span>+ ₹{sgstTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div></>
              ) : (
                <div className="flex justify-between items-center text-slate-500 pb-3 border-b border-slate-100"><span>IGST</span><span>+ ₹{igstTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
              )}
              <div className="flex justify-between items-center pt-2"><span className="text-slate-500 font-bold">New Grand Total</span><span className="text-2xl font-black text-blue-600">₹{grandTotal.toLocaleString()}</span></div>
            </div>
            <button onClick={handleUpdateOrder} disabled={isSaving || cart.length === 0} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-black text-sm shadow-md hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} Save Changes
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
            <div className={`p-6 text-center ${balanceDue === 0 ? 'bg-green-600' : 'bg-slate-800'}`}>
              <p className="text-white/70 font-bold uppercase tracking-wider text-xs mb-1">New Balance Due</p>
              <h2 className="text-4xl font-black text-white">₹{balanceDue.toLocaleString()}</h2>
              {balanceDue === 0 && <span className="inline-flex items-center gap-1 text-green-200 text-xs font-bold mt-2"><CheckCircle className="w-4 h-4"/> Fully Paid</span>}
            </div>
            <div className="p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4 text-green-600"/> Payment History</h3>
              {originalOrder?.payments && originalOrder.payments.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {originalOrder.payments.map((p: any) => (
                    <div key={p.id} className="bg-slate-50 border border-slate-100 p-3 rounded-lg flex justify-between items-center">
                      <div><p className="font-bold text-green-700">₹{p.amount.toLocaleString()}</p><p className="text-[10px] text-slate-400 font-mono mt-0.5">{new Date(p.created_at).toLocaleDateString()} • {p.payment_mode}</p></div>
                      {p.transaction_reference && <span className="text-[10px] font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-500 max-w-[80px] truncate" title={p.transaction_reference}>{p.transaction_reference}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-xs font-bold text-red-400 bg-red-50 rounded-lg mb-4 border border-red-100">No payments recorded yet.</div>
              )}
              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase">Total Collected</span><span className="font-black text-green-700 text-lg">₹{totalPaid.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isCatalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
          <div className="bg-slate-50 w-full max-w-7xl h-full rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-white p-5 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div><h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Search className="w-6 h-6 text-blue-600" /> Edit Order Catalog</h2></div>
              <button onClick={() => setIsCatalogOpen(false)} className="p-2 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="bg-white p-4 border-b border-slate-200 shrink-0"><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search to add or replace products..." className="w-full p-3 border-2 border-blue-100 rounded-xl outline-none focus:border-blue-500 text-lg font-medium shadow-sm" autoFocus /></div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                {filteredCatalog.map((item, idx) => {
                  let totalAct = 0; let remainingPending = pendingQtys[item.id] || 0; let totalAvl = 0;
                  item.stock?.forEach((s: any) => { totalAct += s.quantity; const locDeduction = Math.min(s.quantity, remainingPending); remainingPending -= locDeduction; totalAvl += (s.quantity - locDeduction); });
                  const cartItem = cart.find(i => i.id === item.id);
                  const packSize = item.pack_size || 10;
                  return (
                    <div key={`catalog-${item.id}-${idx}`} className={`bg-white border-2 rounded-xl overflow-hidden flex flex-col transition-all ${cartItem ? 'border-blue-500 shadow-md ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}>
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
                            <div className="flex flex-col items-center"><span className="font-black text-blue-800">{cartItem.quantity} <span className="text-xs font-semibold">Qty</span></span></div>
                            <button onClick={() => handleAddItemToCart(item)} className="p-2 bg-white rounded shadow-sm text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"><Plus className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => handleAddItemToCart(item)} className="w-full py-2 bg-white border border-slate-300 hover:border-blue-500 hover:bg-blue-50 text-slate-700 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add to Order</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
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