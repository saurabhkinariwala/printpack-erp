"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { User, MapPin, Receipt, Truck, CreditCard, Layers, Calendar, Edit2, Trash2, ArrowLeft, ChevronDown, ChevronUp, Package, History, Plus, X, CheckCircle } from "lucide-react"
import { useAuth } from "@/context/AuthContext" 

export default function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const orderId = resolvedParams.id
  const router = useRouter()
  const supabase = createClient()
  
  const { hasPermission } = useAuth() 

  const [order, setOrder] = useState<any>(null)
  const [versions, setVersions] = useState<any[]>([])
  const [selectedVersion, setSelectedVersion] = useState<any>(null)
  const [expandedDispatches, setExpandedDispatches] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null) 

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: "", mode: "Cash", reference: "", date: new Date().toISOString().split('T')[0] })
  
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false)
  const [dispatchForm, setDispatchForm] = useState({ dispatch_number: "", transporter: "", tracking: "", date: new Date().toISOString().split('T')[0] })
  const [dispatchItems, setDispatchItems] = useState<Record<string, number>>({}) 
  
  const [isSaving, setIsSaving] = useState(false)

  const syncOrderStatus = async () => {
    const { data: latestOrder } = await supabase.from('orders').select(`
      total_amount,
      order_items ( quantity_ordered ),
      dispatch_notes ( dispatch_items ( quantity_dispatched ) ),
      payments ( amount )
    `).eq('id', orderId).single();

    if (!latestOrder) return;

    let totalOrdered = 0;
    let totalDispatched = 0;
    latestOrder.order_items?.forEach((i: any) => totalOrdered += i.quantity_ordered || 0);
    latestOrder.dispatch_notes?.forEach((n: any) => n.dispatch_items?.forEach((di: any) => totalDispatched += di.quantity_dispatched || 0));

    const totalPaid = latestOrder.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
    const balanceDue = Math.max(0, latestOrder.total_amount - totalPaid);

    let newStatus = 'Pending';
    
    if (totalOrdered > 0) {
      if (totalDispatched === 0) {
        newStatus = 'Pending';
      } else if (totalDispatched > 0 && totalDispatched < totalOrdered) {
        newStatus = 'Partial';
      } else if (totalDispatched >= totalOrdered) {
        if (balanceDue <= 0) {
          newStatus = 'Completed';
        } else {
          newStatus = 'On Credit';
        }
      }
    }

    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
  }

  const loadOrder = async () => {
    setIsLoading(true);
    setDbError(null);

    const { data: orderData, error } = await supabase.from('orders').select(`
      id, order_number, created_at, status, total_amount, discount_value, transport_mode, transporter_name,
      customers ( name, mobile, city, billing_address, state, gst_number ),
      order_items ( id, item_id, quantity_ordered, unit_price, items ( name, sku, gst_rate, pack_size, sub_categories(name), sub_sub_categories(name) ) ),
      payments ( id, amount, payment_mode, transaction_reference, created_at ),
      dispatch_notes ( id, dispatch_number, dispatched_at, transporter_name, tracking_info, dispatch_items ( item_id, quantity_dispatched, items(name, sku) ) )
    `).eq('id', orderId).maybeSingle();

    if (error) { setDbError(error.message); setIsLoading(false); return; } 
    if (!orderData) { setDbError("Order ID does not exist."); setIsLoading(false); return; }

    setOrder(orderData);

    const { data: versionData } = await supabase.from('order_versions').select('id, version_number, created_at, snapshot_data').eq('order_id', orderId).order('version_number', { ascending: false });
    if (versionData) setVersions(versionData);

    setIsLoading(false);
  }

  useEffect(() => { loadOrder(); }, [supabase, orderId]);

  const handleDelete = async () => {
    if (!window.confirm(`Are you absolutely sure you want to delete order ${order?.order_number}? This cannot be undone.`)) return;
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (!error) router.push('/orders');
    else alert("Failed to delete order: " + error.message);
  }

  const toggleDispatch = (id: string) => setExpandedDispatches(prev => ({ ...prev, [id]: !prev[id] }));

  const handleDeleteDispatch = async (e: React.MouseEvent, noteId: string, dispatchNumber: string) => {
    e.stopPropagation(); 
    if (!window.confirm(`Are you sure you want to delete Dispatch Note ${dispatchNumber}?`)) return;
    
    setIsSaving(true);
    const { error } = await supabase.from('dispatch_notes').delete().eq('id', noteId);
    if (error) alert("Error deleting dispatch note: " + error.message);
    else {
      await syncOrderStatus();
      await loadOrder(); 
    }
    setIsSaving(false);
  }

  const handleSavePayment = async () => {
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) return alert("Please enter a valid amount.");
    setIsSaving(true);
    const { error } = await supabase.from('payments').insert([{
      order_id: orderId, amount: Number(paymentForm.amount), payment_mode: paymentForm.mode, 
      transaction_reference: paymentForm.reference, created_at: new Date(paymentForm.date).toISOString()
    }]);
    
    if (error) alert("Error saving payment: " + error.message);
    else {
      await syncOrderStatus();
      setIsPaymentModalOpen(false);
      setPaymentForm({ amount: "", mode: "Cash", reference: "", date: new Date().toISOString().split('T')[0] });
      await loadOrder(); 
    }
    setIsSaving(false);
  }

  const handleOpenDispatchModal = async () => {
    const { data } = await supabase.from('dispatch_notes').select('dispatch_number').order('dispatch_number', { ascending: false }).limit(1).maybeSingle();
    
    let nextNumStr = "DN-0001";
    if (data && data.dispatch_number) {
      const match = data.dispatch_number.match(/\d+$/);
      if (match) nextNumStr = `DN-${String(parseInt(match[0]) + 1).padStart(4, '0')}`;
      else nextNumStr = `DN-${Date.now().toString().slice(-4)}`;
    }

    setDispatchForm({ dispatch_number: nextNumStr, transporter: "", tracking: "", date: new Date().toISOString().split('T')[0] });
    setDispatchItems({}); 
    setIsDispatchModalOpen(true);
  }

  const handleSaveDispatch = async () => {
    const itemsToDispatch = Object.entries(dispatchItems).filter(([_, qty]) => qty > 0);
    if (itemsToDispatch.length === 0) return alert("Please select at least one item to dispatch.");
    if (!dispatchForm.dispatch_number) return alert("Dispatch number is required.");
    
    setIsSaving(true);
    
    const { data: newNote, error: noteError } = await supabase.from('dispatch_notes').insert([{
      order_id: orderId, 
      dispatch_number: dispatchForm.dispatch_number, 
      transporter_name: dispatchForm.transporter, 
      tracking_info: dispatchForm.tracking, 
      dispatched_at: new Date(dispatchForm.date).toISOString()
    }]).select().single();

    if (noteError) { alert("Error creating dispatch note: " + noteError.message); setIsSaving(false); return; }

    const dItemsPayload = itemsToDispatch.map(([orderItemId, qty]) => {
      const orderItem = order.order_items.find((oi: any) => oi.id === orderItemId);
      return { dispatch_note_id: newNote.id, order_item_id: orderItem.id, item_id: orderItem.item_id, quantity_dispatched: qty };
    });

    const { error: itemsError } = await supabase.from('dispatch_items').insert(dItemsPayload);
    if (itemsError) alert("Error saving dispatch items: " + itemsError.message);

    await syncOrderStatus();
    setIsDispatchModalOpen(false);
    await loadOrder(); 
    setIsSaving(false);
  }

  const getDispatchedQty = (itemId: string) => {
    if (!order || !order.dispatch_notes) return 0;
    let total = 0;
    order.dispatch_notes.forEach((note: any) => {
      note.dispatch_items?.forEach((di: any) => {
        if (di.item_id === itemId) total += di.quantity_dispatched;
      });
    });
    return total;
  }

  if (isLoading) return <div className="p-20 text-center text-slate-500 font-bold">Loading Order Details...</div>;
  if (dbError) return <div className="p-20 text-center text-red-600 font-bold bg-red-50 border border-red-200 m-10 rounded-xl">Database Error: {dbError}</div>;
  if (!order) return <div className="p-20 text-center text-red-500 font-bold">Order not found.</div>;

  const displayData = selectedVersion ? selectedVersion.snapshot_data : order;
  const isHistorical = !!selectedVersion;

  let subtotal = 0;
  displayData.order_items?.forEach((item: any) => subtotal += (item.unit_price * item.quantity_ordered));
  let discountAmt = 0;
  const cleanDiscount = (displayData.discount_value || "").replace('-', '').trim();
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

  displayData.order_items?.forEach((item: any) => {
    const itemTaxable = (item.unit_price * item.quantity_ordered) * (1 - discountFraction);
    const rate = item.items?.gst_rate || 0;
    if (displayData.customers?.state === "Maharashtra") {
      cgstTotal += itemTaxable * ((rate / 2) / 100); cgstTotal += itemTaxable * ((rate / 2) / 100);
    } else {
      igstTotal += itemTaxable * (rate / 100);
    }
  });

  const grandTotal = Math.round(taxableAmount + cgstTotal + sgstTotal + igstTotal);
  const totalPaid = order.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;
  const balanceDue = Math.max(0, grandTotal - totalPaid);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">
      
      <div className="flex items-center gap-4">
        <button onClick={() => { router.refresh(); router.push('/orders'); }} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 shadow-sm"><ArrowLeft className="w-5 h-5"/></button>
        <h1 className="text-xl font-bold text-slate-800">Back to Orders</h1>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-slate-800">{displayData.order_number}</h2>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${displayData.status === 'Completed' ? 'bg-green-100 text-green-800 border border-green-200' : displayData.status === 'Pending' ? 'bg-red-100 text-red-800 border border-red-200' : displayData.status === 'On Credit' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-yellow-100 text-yellow-800 border border-yellow-300'}`}>
                {displayData.status}
              </span>
              {isHistorical && <span className="px-2.5 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><History className="w-3 h-3"/> Viewing V{selectedVersion.version_number}</span>}
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1 flex items-center gap-2"><Calendar className="w-4 h-4"/> {new Date(displayData.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
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
              {hasPermission('edit_orders') && (
                <Link href={`/orders/${orderId}/edit`} className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition-colors text-sm">
                  <Edit2 className="w-4 h-4" /> Edit
                </Link>
              )}
              
              <button onClick={handleDelete} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition-colors text-sm">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 opacity-95">
        
        <div className="lg:col-span-2 space-y-6">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1"><User className="w-3 h-3"/> Customer Info</h3>
              <p className="font-bold text-slate-800">{displayData.customers?.name}</p>
              <p className="font-mono text-sm text-slate-600 mt-1">{displayData.customers?.mobile}</p>
              <p className="text-sm text-slate-500 mt-2">{displayData.customers?.billing_address}, {displayData.customers?.city}, {displayData.customers?.state}</p>
              <p className="text-xs font-mono text-slate-400 mt-2">GST: {displayData.customers?.gst_number || 'N/A'}</p>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1"><Truck className="w-3 h-3"/> Delivery Info</h3>
              <div className="space-y-3">
                <div><p className="text-[10px] font-bold text-slate-400 uppercase">Mode</p><p className="font-bold text-slate-700">{displayData.transport_mode || 'Self Pickup'}</p></div>
                {displayData.transport_mode === 'Transporter' && (
                  <div><p className="text-[10px] font-bold text-slate-400 uppercase">Transporter</p><p className="font-bold text-slate-700">{displayData.transporter_name}</p></div>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-600"/> Ordered Items</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                  <tr><th className="py-3 px-6">Item Details</th><th className="py-3 px-4 text-right">Price (₹)</th><th className="py-3 px-4 text-center">Qty Ordered</th><th className="py-3 px-4 text-center">Dispatched</th><th className="py-3 px-6 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {displayData.order_items?.map((item: any) => {
                    const dispatched = getDispatchedQty(item.item_id);
                    const isFullyDispatched = dispatched >= item.quantity_ordered;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-800">{item.items?.name}</div>
                          <div className="text-[10px] text-blue-600 font-semibold uppercase mt-0.5">{item.items?.sub_categories?.name} › {item.items?.sub_sub_categories?.name || 'Standard'}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.items?.sku}</div>
                        </td>
                        <td className="py-4 px-4 text-right font-medium text-slate-700">{item.unit_price.toLocaleString()}</td>
                        <td className="py-4 px-4 text-center font-black text-slate-800 text-lg">{item.quantity_ordered}</td>
                        <td className="py-4 px-4 text-center">
                          <span className={`px-2 py-1 rounded font-bold text-xs ${isFullyDispatched ? 'bg-green-100 text-green-700' : dispatched > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>
                            {dispatched} / {item.quantity_ordered}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right font-black text-slate-800">₹{(item.unit_price * item.quantity_ordered).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {!isHistorical && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-purple-600"/> Dispatch History</h3>
                
                {hasPermission('edit_dispatch') && (
                  <button onClick={handleOpenDispatchModal} className="bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-colors">
                    <Plus className="w-3 h-3"/> Add Dispatch Note
                  </button>
                )}
              </div>
              
              <div className="p-6">
                {order.dispatch_notes && order.dispatch_notes.length > 0 ? (
                  <div className="space-y-4">
                    {order.dispatch_notes.map((note: any) => (
                      <div key={note.id} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div onClick={() => toggleDispatch(note.id)} className="w-full bg-white p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer text-left">
                          <div className="flex flex-wrap gap-8 items-center">
                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Dispatch No.</p><p className="font-bold text-purple-700">{note.dispatch_number}</p></div>
                            <div><p className="text-[10px] font-bold text-slate-400 uppercase">Date</p><p className="font-medium text-slate-700">{new Date(note.dispatched_at).toLocaleDateString()}</p></div>
                            {note.transporter_name && <div><p className="text-[10px] font-bold text-slate-400 uppercase">Transporter</p><p className="font-medium text-slate-700">{note.transporter_name}</p></div>}
                            {note.tracking_info && <div><p className="text-[10px] font-bold text-slate-400 uppercase">Tracking</p><p className="font-mono text-slate-600 text-xs">{note.tracking_info}</p></div>}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {hasPermission('edit_dispatch') && (
                              <button onClick={(e) => handleDeleteDispatch(e, note.id, note.dispatch_number)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Delete Note">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {expandedDispatches[note.id] ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                          </div>
                        </div>
                        
                        {expandedDispatches[note.id] && (
                          <div className="p-4 bg-slate-50 border-t border-slate-200">
                            <table className="w-full text-xs text-left">
                              <thead className="text-slate-400 border-b border-slate-200 uppercase tracking-wider">
                                <tr><th className="pb-2">Product Dispatched</th><th className="pb-2 text-right">Qty Sent</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {note.dispatch_items?.map((dItem: any, idx: number) => (
                                  <tr key={idx}>
                                    <td className="py-3 font-bold text-slate-700">{dItem.items?.name} <span className="font-mono font-normal text-slate-500 ml-2">({dItem.items?.sku})</span></td>
                                    <td className="py-3 text-right font-black text-slate-800 text-sm">{dItem.quantity_dispatched}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">No items have been dispatched yet.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6 lg:sticky lg:top-6 self-start w-full">
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2"><Receipt className="w-4 h-4 text-blue-600"/> Tax & Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Subtotal</span><span className="font-bold text-slate-800">₹{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
              {discountAmt > 0 && <div className="flex justify-between items-center pb-3 border-b border-slate-100"><span className="text-slate-500 font-medium">Discount</span><span className="text-red-600 font-bold">- ₹{discountAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>}
              <div className="flex justify-between items-center"><span className="text-slate-700 font-bold">Taxable Amount</span><span className="font-bold text-slate-800">₹{taxableAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
              {displayData.customers?.state === "Maharashtra" ? (
                <><div className="flex justify-between items-center text-slate-500"><span>CGST</span><span>+ ₹{cgstTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div><div className="flex justify-between items-center text-slate-500 pb-3 border-b border-slate-100"><span>SGST</span><span>+ ₹{sgstTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div></>
              ) : (
                <div className="flex justify-between items-center text-slate-500 pb-3 border-b border-slate-100"><span>IGST</span><span>+ ₹{igstTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
              )}
              <div className="flex justify-between items-center pt-2"><span className="text-slate-500 font-bold">Invoice Total</span><span className="text-xl font-black text-blue-600">₹{grandTotal.toLocaleString()}</span></div>
            </div>
          </div>

          {!isHistorical && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
              <div className={`p-6 text-center ${balanceDue === 0 ? 'bg-green-600' : 'bg-slate-800'}`}>
                <p className="text-white/70 font-bold uppercase tracking-wider text-xs mb-1">Balance Due</p>
                <h2 className="text-4xl font-black text-white">₹{balanceDue.toLocaleString()}</h2>
                {balanceDue === 0 && <span className="inline-flex items-center gap-1 text-green-200 text-xs font-bold mt-2"><CheckCircle className="w-4 h-4"/> Fully Paid</span>}
              </div>

              <div className="p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-green-600"/> Payment History</h3>
                  {balanceDue > 0 && (
                    <button onClick={() => setIsPaymentModalOpen(true)} className="bg-green-100 hover:bg-green-200 text-green-800 border border-green-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow-sm transition-colors">
                      <Plus className="w-3 h-3"/> Add Pay
                    </button>
                  )}
                </div>
                
                {order.payments && order.payments.length > 0 ? (
                  <div className="space-y-3 mb-4">
                    {order.payments.map((p: any) => (
                      <div key={p.id} className="bg-slate-50 border border-slate-100 p-3 rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-bold text-green-700">₹{p.amount.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{new Date(p.created_at).toLocaleDateString()} • {p.payment_mode}</p>
                        </div>
                        {p.transaction_reference && <span className="text-[10px] font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-500 max-w-[80px] truncate" title={p.transaction_reference}>{p.transaction_reference}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs font-bold text-red-400 bg-red-50 rounded-lg mb-4 border border-red-100">No payments recorded yet.</div>
                )}
                
                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-500 uppercase">Total Collected</span>
                  <span className="font-black text-green-700 text-lg">₹{totalPaid.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* --- MODALS --- */}

      {/* ADD PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-5 h-5 text-green-600"/> Record New Payment</h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Remaining Balance</span>
                <span className="font-black text-xl text-blue-700">₹{balanceDue.toLocaleString()}</span>
              </div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">Amount Received (₹)</label><input type="number" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm, amount: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-green-500 font-bold text-green-700 text-lg" placeholder={`Max ₹${balanceDue}`} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-500 uppercase">Mode</label><select value={paymentForm.mode} onChange={e=>setPaymentForm({...paymentForm, mode: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-green-500 bg-white"><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="UPI">UPI</option><option value="Card">Card</option></select></div>
                <div><label className="text-xs font-bold text-slate-500 uppercase">Date</label><input type="date" value={paymentForm.date} onChange={e=>setPaymentForm({...paymentForm, date: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-green-500" /></div>
              </div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">Reference / Txn ID</label><input type="text" value={paymentForm.reference} onChange={e=>setPaymentForm({...paymentForm, reference: e.target.value})} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-green-500 font-mono" placeholder="Optional" /></div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button onClick={() => setIsPaymentModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSavePayment} disabled={isSaving} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-green-700 disabled:opacity-50">Save Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD DISPATCH MODAL */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
          <div className="bg-white w-full max-w-4xl h-full max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-purple-600"/> Create Dispatch Note</h2>
                <p className="text-xs text-slate-500 mt-1">Select the items being shipped right now to update pending stock.</p>
              </div>
              <button onClick={() => setIsDispatchModalOpen(false)} className="text-slate-400 hover:text-red-500 bg-white p-2 rounded-full border border-slate-200"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                <div><label className="text-[10px] font-bold text-purple-800 uppercase">Dispatch No *</label><input type="text" value={dispatchForm.dispatch_number} onChange={e=>setDispatchForm({...dispatchForm, dispatch_number: e.target.value})} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500 font-bold" /></div>
                <div><label className="text-[10px] font-bold text-purple-800 uppercase">Date</label><input type="date" value={dispatchForm.date} onChange={e=>setDispatchForm({...dispatchForm, date: e.target.value})} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500" /></div>
                <div><label className="text-[10px] font-bold text-purple-800 uppercase">Transporter Name</label><input type="text" value={dispatchForm.transporter} onChange={e=>setDispatchForm({...dispatchForm, transporter: e.target.value})} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500" placeholder="Optional" /></div>
                <div><label className="text-[10px] font-bold text-purple-800 uppercase">Tracking Info</label><input type="text" value={dispatchForm.tracking} onChange={e=>setDispatchForm({...dispatchForm, tracking: e.target.value})} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500" placeholder="AWB / Link" /></div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-3 text-sm">Select Quantities to Dispatch Now</h4>
                <table className="w-full text-sm text-left border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase text-slate-600 font-bold">
                    <tr><th className="p-3">Product</th><th className="p-3 text-center">Ordered</th><th className="p-3 text-center">Already Sent</th><th className="p-3 text-center">Pending</th><th className="p-3 bg-purple-100 text-purple-900 text-center w-32">Dispatch Now</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.order_items?.map((item: any) => {
                      const previouslySent = getDispatchedQty(item.item_id);
                      const pending = Math.max(0, item.quantity_ordered - previouslySent);
                      const currentVal = dispatchItems[item.id] || 0;
                      
                      return (
                        <tr key={item.id} className={pending === 0 ? "bg-slate-50 opacity-60" : ""}>
                          <td className="p-3"><p className="font-bold">{item.items?.name}</p><p className="text-[10px] font-mono text-slate-400">{item.items?.sku}</p></td>
                          <td className="p-3 text-center font-bold">{item.quantity_ordered}</td>
                          <td className="p-3 text-center text-slate-500">{previouslySent}</td>
                          <td className="p-3 text-center font-black text-orange-600">{pending}</td>
                          <td className="p-3 bg-purple-50">
                            <input 
                              type="number" min="0" max={pending} disabled={pending === 0}
                              value={currentVal} 
                              onChange={(e) => {
                                const val = Math.min(pending, Math.max(0, Number(e.target.value)));
                                setDispatchItems(prev => ({ ...prev, [item.id]: val }));
                              }} 
                              className="w-full p-1.5 border border-purple-300 rounded text-center font-bold outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-slate-200" 
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-4 shrink-0">
              <button onClick={() => setIsDispatchModalOpen(false)} className="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={handleSaveDispatch} disabled={isSaving} className="flex-[2] py-3 bg-purple-600 text-white rounded-lg font-bold shadow-md hover:bg-purple-700 transition-colors disabled:opacity-50">Save & Record Dispatch Note</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}