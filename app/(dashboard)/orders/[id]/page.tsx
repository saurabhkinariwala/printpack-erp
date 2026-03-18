"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { User, MapPin, Receipt, Truck, CreditCard, Layers, Calendar, Edit2, Trash2, ArrowLeft, ChevronDown, ChevronUp, Package, History, Plus, X, CheckCircle, ImageIcon, Ban, AlertTriangle } from "lucide-react"
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
  const [locations, setLocations] = useState<any[]>([])
  const [expandedDispatches, setExpandedDispatches] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: "", mode: "Cash", reference: "", date: new Date().toISOString().split('T')[0] })

  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false)
  const [dispatchForm, setDispatchForm] = useState({ dispatch_number: "", transporter: "", tracking: "", date: new Date().toISOString().split('T')[0], location_id: "" })
  const [dispatchItems, setDispatchItems] = useState<Record<string, number>>({})

  // --- NEW CANCEL / REFUND STATE ---
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [refundForm, setRefundForm] = useState({ mode: "Cash", reference: "", date: new Date().toISOString().split('T')[0] })

  const [isSaving, setIsSaving] = useState(false)

  const syncOrderStatus = async () => {
    const { data: latestOrder } = await supabase.from('orders').select(`
      status,
      total_amount,
      order_items ( quantity_ordered ),
      dispatch_notes ( dispatch_items ( quantity_dispatched ) ),
      payments ( amount )
    `).eq('id', orderId).single();

    if (!latestOrder) return;

    if (latestOrder.status === 'Cancelled') return;

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
      order_items ( id, item_id, quantity_ordered, unit_price, items ( name, sku, image_path, gst_rate, pack_size, sub_categories(name), sub_sub_categories(name) ) ),
      payments ( id, amount, payment_mode, transaction_reference, created_at ),
      dispatch_notes ( id, dispatch_number, dispatched_at, transporter_name, tracking_info, dispatch_items ( item_id, quantity_dispatched, items(name, sku, pack_size), locations(name) ) )
    `).eq('id', orderId).maybeSingle();

    if (error) { setDbError(error.message); setIsLoading(false); return; }
    if (!orderData) { setDbError("Order ID does not exist."); setIsLoading(false); return; }

    setOrder(orderData);

    const { data: versionData } = await supabase.from('order_versions').select('id, version_number, created_at, snapshot_data').eq('order_id', orderId).order('version_number', { ascending: false });
    if (versionData) setVersions(versionData);

    setIsLoading(false);
  }

  useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => {
      if (data) setLocations(data);
    });
    loadOrder();
  }, [supabase, orderId]);

  // --- SAFE CANCEL WORKFLOW ---
  const handleCancelClick = () => {
    // Calculate total paid so far
    const paidSoFar = order?.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || 0;

    if (paidSoFar > 0) {
      // If money was collected, open the refund modal
      setIsCancelModalOpen(true);
    } else {
      // If no money was collected, just confirm and cancel
      if (window.confirm(`Are you absolutely sure you want to CANCEL order ${order?.order_number}? Stock will be returned to inventory.`)) {
        executeCancellation(0);
      }
    }
  }

  const executeCancellation = async (refundAmount: number) => {
    setIsSaving(true);
    const { error } = await supabase.rpc('cancel_order_logic', {
      p_order_id: orderId,
      p_refund_amount: refundAmount,
      p_refund_mode: refundForm.mode,
      p_refund_ref: refundForm.reference,
      p_refund_date: new Date(refundForm.date).toISOString()
    });

    if (error) {
      alert("Failed to cancel order: " + error.message);
    } else {
      setIsCancelModalOpen(false);
      await loadOrder();
    }
    setIsSaving(false);
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

    setDispatchForm({ dispatch_number: nextNumStr, transporter: "", tracking: "", date: new Date().toISOString().split('T')[0], location_id: "" });
    setDispatchItems({});
    setIsDispatchModalOpen(true);
  }

  const handleSaveDispatch = async () => {
    const itemsToDispatch = Object.entries(dispatchItems).filter(([_, qty]) => qty > 0);
    if (itemsToDispatch.length === 0) return alert("Please select at least one item to dispatch.");
    if (!dispatchForm.dispatch_number) return alert("Dispatch number is required.");
    if (!dispatchForm.location_id) return alert("Please select a pick location.");

    setIsSaving(true);

    // Build items payload for the atomic function
    const itemsPayload = itemsToDispatch.map(([orderItemId, qty]) => {
      const orderItem = order.order_items.find((oi: any) => oi.id === orderItemId);
      return {
        order_item_id: orderItem.id,
        item_id: orderItem.item_id,
        location_id: dispatchForm.location_id,
        quantity_dispatched: qty,
      };
    });

    // Single atomic call:
    //   - inserts dispatch_note
    //   - inserts dispatch_items
    //   - deducts stock.quantity per location (most-stock-first)
    //   - logs each deduction in stock_ledger
    //   - rolls back everything on error
    const { data: result, error: rpcError } = await supabase.rpc(
      'create_dispatch_note_atomic',
      {
        p_order_id: orderId,
        p_dispatch_number: dispatchForm.dispatch_number,
        p_transporter: dispatchForm.transporter || null,
        p_tracking: dispatchForm.tracking || null,
        p_dispatched_at: new Date(dispatchForm.date).toISOString(),
        p_items: itemsPayload,
      }
    );

    if (rpcError) {
      alert("Dispatch failed: " + rpcError.message);
      setIsSaving(false);
      return;
    }

    if (!result.success) {
      const errMsg: string = result.error || "Unknown error";

      // Parse stock shortage: "INSUFFICIENT_STOCK::ItemName::available::requested"
      if (errMsg.includes("INSUFFICIENT_STOCK")) {
        const parts = errMsg.split("::");
        alert(
          `Cannot dispatch — not enough stock for "${parts[1]}".\n` +
          `Available: ${parts[2]} · You entered: ${parts[3]}\n\n` +
          `Please reduce the dispatch quantity and try again.`
        );
      } else {
        alert("Dispatch failed: " + errMsg);
      }

      setIsSaving(false);
      return;
    }

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
    <>
      <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20 print:hidden">

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => { router.refresh(); router.push('/orders'); }} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 shadow-sm"><ArrowLeft className="w-5 h-5" /></button>
            <h1 className="text-xl font-bold text-slate-800">Back to Orders</h1>
          </div>

          <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition-colors text-sm">
            <Receipt className="w-4 h-4" /> Print Tax Invoice
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-6">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-800">{displayData.order_number}</h2>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${displayData.status === 'Cancelled' ? 'bg-slate-200 text-slate-600 border border-slate-300' :
                  displayData.status === 'Completed' ? 'bg-green-100 text-green-800 border border-green-200' :
                    displayData.status === 'Pending' ? 'bg-red-100 text-red-800 border border-red-200' :
                      displayData.status === 'On Credit' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                        'bg-yellow-100 text-yellow-800 border border-yellow-300'
                  }`}>
                  {displayData.status}
                </span>
                {isHistorical && <span className="px-2.5 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><History className="w-3 h-3" /> Viewing V{selectedVersion.version_number}</span>}
              </div>
              <p className="text-sm text-slate-500 font-medium mt-1 flex items-center gap-2"><Calendar className="w-4 h-4" /> {new Date(displayData.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
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

            {!isHistorical && displayData.status !== 'Cancelled' && (
              <>
                {hasPermission('edit_orders') && (
                  <Link href={`/orders/${orderId}/edit`} className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition-colors text-sm">
                    <Edit2 className="w-4 h-4" /> Edit
                  </Link>
                )}

                <button onClick={handleCancelClick} disabled={isSaving} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition-colors text-sm disabled:opacity-50">
                  <Ban className="w-4 h-4" /> Cancel Order
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 opacity-95">

          <div className="lg:col-span-2 space-y-6">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1"><User className="w-3 h-3" /> Customer Info</h3>
                <p className="font-bold text-slate-800">{displayData.customers?.name}</p>
                <p className="font-mono text-sm text-slate-600 mt-1">{displayData.customers?.mobile}</p>
                <p className="text-sm text-slate-500 mt-2">{displayData.customers?.billing_address}, {displayData.customers?.city}, {displayData.customers?.state}</p>
                <p className="text-xs font-mono text-slate-400 mt-2">GST: {displayData.customers?.gst_number || 'N/A'}</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1"><Truck className="w-3 h-3" /> Delivery Info</h3>
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
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-600" /> Ordered Items</h3>
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
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-purple-600" /> Dispatch History</h3>

                  {hasPermission('edit_dispatch') && displayData.status !== 'Cancelled' && (
                    <button onClick={handleOpenDispatchModal} className="bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-colors">
                      <Plus className="w-3 h-3" /> Add Dispatch Note
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
                              <div><p className="text-[10px] font-bold text-slate-400 uppercase">Delivery Mode</p><p className="font-medium text-slate-700">{note.transporter_name || "Self Pickup"}</p></div>
                              <div><p className="text-[10px] font-bold text-slate-400 uppercase">Location</p><p className="font-medium text-slate-700">{note.dispatch_items?.[0]?.locations?.name || "—"}</p></div>
                              {note.tracking_info && <div><p className="text-[10px] font-bold text-slate-400 uppercase">Tracking</p><p className="font-mono text-slate-600 text-xs">{note.tracking_info}</p></div>}
                            </div>

                            <div className="flex items-center gap-3">
                              {hasPermission('edit_dispatch') && displayData.status !== 'Cancelled' && (
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
                                  <tr>
                                    <th className="pb-2">Product Dispatched</th>
                                    <th className="pb-2 text-center">Pack Size</th>
                                    <th className="pb-2 text-right">Qty Sent</th>
                                    <th className="pb-2 text-right text-purple-600">Bundles</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {note.dispatch_items?.map((dItem: any, idx: number) => {
                                    const packSize = dItem.items?.pack_size || 1
                                    const bundles = Math.ceil(dItem.quantity_dispatched / packSize)
                                    return (
                                      <tr key={idx}>
                                        <td className="py-3 font-bold text-slate-700">
                                          {dItem.items?.name}
                                          <span className="font-mono font-normal text-slate-400 ml-2">({dItem.items?.sku})</span>
                                        </td>
                                        <td className="py-3 text-center">
                                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                            {packSize}
                                          </span>
                                        </td>
                                        <td className="py-3 text-right font-black text-slate-800 text-sm">
                                          {dItem.quantity_dispatched}
                                        </td>
                                        <td className="py-3 text-right">
                                          <span className="font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                            {bundles}
                                          </span>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot className="border-t border-slate-200">
                                  <tr>
                                    <td colSpan={3} className="pt-2 text-right font-bold text-slate-500 uppercase text-[10px] tracking-wide">Total Bundles</td>
                                    <td className="pt-2 text-right font-black text-purple-700">
                                      {note.dispatch_items?.reduce((total: number, dItem: any) =>
                                        total + Math.ceil(dItem.quantity_dispatched / (dItem.items?.pack_size || 1)), 0
                                      )}
                                    </td>
                                  </tr>
                                </tfoot>
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
              <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2"><Receipt className="w-4 h-4 text-blue-600" /> Tax & Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Subtotal</span><span className="font-bold text-slate-800">₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                {discountAmt > 0 && <div className="flex justify-between items-center pb-3 border-b border-slate-100"><span className="text-slate-500 font-medium">Discount</span><span className="text-red-600 font-bold">- ₹{discountAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
                <div className="flex justify-between items-center"><span className="text-slate-700 font-bold">Taxable Amount</span><span className="font-bold text-slate-800">₹{taxableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                {displayData.customers?.state === "Maharashtra" ? (
                  <>
                    <div className="flex justify-between items-center text-slate-500"><span>CGST</span><span>+ ₹{cgstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between items-center text-slate-500 pb-3 border-b border-slate-100"><span>SGST</span><span>+ ₹{sgstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between items-center text-slate-500 pb-3 border-b border-slate-100"><span>IGST</span><span>+ ₹{igstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                )}
                <div className="flex justify-between items-center pt-2"><span className="text-slate-500 font-bold">Invoice Total</span><span className="text-xl font-black text-blue-600">₹{grandTotal.toLocaleString()}</span></div>
              </div>
            </div>

            {!isHistorical && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
                <div className={`p-6 text-center ${displayData.status === 'Cancelled' ? 'bg-slate-600' : balanceDue === 0 ? 'bg-green-600' : 'bg-slate-800'}`}>
                  <p className="text-white/70 font-bold uppercase tracking-wider text-xs mb-1">Balance Due</p>
                  <h2 className="text-4xl font-black text-white">₹{displayData.status === 'Cancelled' ? '0' : balanceDue.toLocaleString()}</h2>
                  {balanceDue === 0 && displayData.status !== 'Cancelled' && <span className="inline-flex items-center gap-1 text-green-200 text-xs font-bold mt-2"><CheckCircle className="w-4 h-4" /> Fully Paid</span>}
                </div>

                <div className="p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-green-600" /> Payment History</h3>

                    {balanceDue > 0 && displayData.status !== 'Cancelled' && (
                      <button onClick={() => setIsPaymentModalOpen(true)} className="bg-green-100 hover:bg-green-200 text-green-800 border border-green-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow-sm transition-colors">
                        <Plus className="w-3 h-3" /> Add Pay
                      </button>
                    )}
                  </div>

                  {order.payments && order.payments.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {order.payments.map((p: any) => (
                        <div key={p.id} className="bg-slate-50 border border-slate-100 p-3 rounded-lg flex justify-between items-center">
                          <div>
                            <p className={`font-bold ${p.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>
                              {p.amount < 0 ? '-' : ''}₹{Math.abs(p.amount).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {new Date(p.created_at).toLocaleDateString()} • {p.payment_mode}
                              {p.amount < 0 && <span className="ml-2 font-bold text-red-500 uppercase">Refund</span>}
                            </p>
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

        {/* CANCEL ORDER / REFUND MODAL */}
        {isCancelModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col border-2 border-red-500">
              <div className="p-5 border-b border-red-100 flex gap-3 items-center bg-red-50">
                <div className="p-2 bg-red-200 text-red-700 rounded-full"><AlertTriangle className="w-5 h-5" /></div>
                <div>
                  <h2 className="text-lg font-bold text-red-800">Cancel & Refund Order</h2>
                  <p className="text-xs text-red-600/80 font-medium">Stock will be restored to inventory automatically.</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Amount to Refund</span>
                  <span className="font-black text-3xl text-slate-800">₹{totalPaid.toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-slate-500 uppercase">Refund Mode</label><select value={refundForm.mode} onChange={e => setRefundForm({ ...refundForm, mode: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-red-500 bg-white"><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="UPI">UPI</option><option value="Card">Card</option></select></div>
                  <div><label className="text-xs font-bold text-slate-500 uppercase">Refund Date</label><input type="date" value={refundForm.date} onChange={e => setRefundForm({ ...refundForm, date: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-red-500" /></div>
                </div>
                <div><label className="text-xs font-bold text-slate-500 uppercase">Reference / Txn ID</label><input type="text" value={refundForm.reference} onChange={e => setRefundForm({ ...refundForm, reference: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-red-500 font-mono" placeholder="Optional" /></div>
              </div>
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button onClick={() => setIsCancelModalOpen(false)} className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100">Abort</button>
                <button onClick={() => executeCancellation(totalPaid)} disabled={isSaving} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-red-700 disabled:opacity-50">Process Refund</button>
              </div>
            </div>
          </div>
        )}

        {/* ADD PAYMENT MODAL */}
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-5 h-5 text-green-600" /> Record New Payment</h2>
                <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Remaining Balance</span>
                  <span className="font-black text-xl text-blue-700">₹{balanceDue.toLocaleString()}</span>
                </div>
                <div><label className="text-xs font-bold text-slate-500 uppercase">Amount Received (₹)</label><input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-green-500 font-bold text-green-700 text-lg" placeholder={`Max ₹${balanceDue}`} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-slate-500 uppercase">Mode</label><select value={paymentForm.mode} onChange={e => setPaymentForm({ ...paymentForm, mode: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-green-500 bg-white"><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="UPI">UPI</option><option value="Card">Card</option></select></div>
                  <div><label className="text-xs font-bold text-slate-500 uppercase">Date</label><input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-green-500" /></div>
                </div>
                <div><label className="text-xs font-bold text-slate-500 uppercase">Reference / Txn ID</label><input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} className="w-full p-2.5 mt-1 border border-slate-300 rounded-lg outline-none focus:border-green-500 font-mono" placeholder="Optional" /></div>
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
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-purple-600" /> Create Dispatch Note</h2>
                  <p className="text-xs text-slate-500 mt-1">Select the items being shipped right now to update pending stock.</p>
                </div>
                <button onClick={() => setIsDispatchModalOpen(false)} className="text-slate-400 hover:text-red-500 bg-white p-2 rounded-full border border-slate-200"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                  <div><label className="text-[10px] font-bold text-purple-800 uppercase">Dispatch No *</label><input type="text" value={dispatchForm.dispatch_number} onChange={e => setDispatchForm({ ...dispatchForm, dispatch_number: e.target.value })} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500 font-bold" /></div>
                  <div><label className="text-[10px] font-bold text-purple-800 uppercase">Date</label><input type="date" value={dispatchForm.date} onChange={e => setDispatchForm({ ...dispatchForm, date: e.target.value })} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500" /></div>
                  <div>
                    <label className="text-[10px] font-bold text-purple-800 uppercase">Pick Location *</label>
                    <select value={dispatchForm.location_id} onChange={e => setDispatchForm({ ...dispatchForm, location_id: e.target.value })} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">Select...</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div><label className="text-[10px] font-bold text-purple-800 uppercase">Transporter Name</label><input type="text" value={dispatchForm.transporter} onChange={e => setDispatchForm({ ...dispatchForm, transporter: e.target.value })} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500" placeholder="Optional" /></div>
                  <div><label className="text-[10px] font-bold text-purple-800 uppercase">Tracking Info</label><input type="text" value={dispatchForm.tracking} onChange={e => setDispatchForm({ ...dispatchForm, tracking: e.target.value })} className="w-full p-2 mt-1 border border-purple-200 rounded outline-none focus:ring-1 focus:ring-purple-500" placeholder="AWB / Link" /></div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-3 text-sm">Select Quantities to Dispatch Now</h4>
                  <table className="w-full text-sm text-left border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase text-slate-600 font-bold">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3 text-center">Ordered</th>
                        <th className="p-3 text-center">Already Sent</th>
                        <th className="p-3 text-center">Pending</th>
                        <th className="p-3 text-center">Pack Size</th>
                        <th className="p-3 bg-purple-100 text-purple-900 text-center w-32">Dispatch Now</th>
                        <th className="p-3 text-center text-purple-700">Bundles</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {order.order_items?.map((item: any) => {
                        const previouslySent = getDispatchedQty(item.item_id);
                        const pending = Math.max(0, item.quantity_ordered - previouslySent);
                        const currentVal = dispatchItems[item.id] || 0;

                        return (
                          <tr key={item.id} className={pending === 0 ? "bg-slate-50 opacity-60" : ""}>
                            <td className="p-3">
                              <p className="font-bold">{item.items?.name}</p>
                              <p className="text-[10px] font-mono text-slate-400">{item.items?.sku}</p>
                            </td>
                            <td className="p-3 text-center font-bold">{item.quantity_ordered}</td>
                            <td className="p-3 text-center text-slate-500">{previouslySent}</td>
                            <td className="p-3 text-center font-black text-orange-600">{pending}</td>
                            <td className="p-3 text-center">
                              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                {item.items?.pack_size || 1}
                              </span>
                            </td>
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
                            <td className="p-3 text-center">
                              {currentVal > 0 ? (
                                <span className="font-black text-purple-700">
                                  {Math.ceil(currentVal / (item.items?.pack_size || 1))}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-5 border-t border-slate-200 bg-slate-50 shrink-0">
                {/* Bundle summary strip */}
                {Object.values(dispatchItems).some(v => v > 0) && (
                  <div className="flex flex-wrap gap-3 mb-4">
                    {order.order_items
                      ?.filter((item: any) => (dispatchItems[item.id] || 0) > 0)
                      .map((item: any) => {
                        const qty = dispatchItems[item.id] || 0
                        const packSize = item.items?.pack_size || 1
                        const bundles = Math.ceil(qty / packSize)
                        return (
                          <div key={item.id} className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
                            <span className="text-xs font-bold text-slate-700 max-w-[120px] truncate">{item.items?.name}</span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-xs text-slate-500">{qty} qty</span>
                            <span className="text-[10px] text-slate-400">÷</span>
                            <span className="text-xs text-slate-500">pack {packSize}</span>
                            <span className="text-[10px] text-slate-400">=</span>
                            <span className="text-xs font-black text-purple-700">{bundles} bundle{bundles !== 1 ? "s" : ""}</span>
                          </div>
                        )
                      })}
                    <div className="flex items-center gap-2 bg-purple-700 text-white rounded-lg px-3 py-1.5 ml-auto">
                      <span className="text-xs font-semibold">Total Bundles</span>
                      <span className="text-base font-black">
                        {order.order_items
                          ?.reduce((total: number, item: any) => {
                            const qty = dispatchItems[item.id] || 0
                            if (!qty) return total
                            return total + Math.ceil(qty / (item.items?.pack_size || 1))
                          }, 0)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <button onClick={() => setIsDispatchModalOpen(false)} className="flex-1 py-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-100 transition-colors">Cancel</button>
                  <button onClick={handleSaveDispatch} disabled={isSaving} className="flex-[2] py-3 bg-purple-600 text-white rounded-lg font-bold shadow-md hover:bg-purple-700 transition-colors disabled:opacity-50">Save & Record Dispatch Note</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- WE CLOSE THE MAIN DASHBOARD DIV HERE! --- */}
      </div>

      {/* --- INJECT CSS TO HIDE BROWSER URL/DATE HEADERS --- */}
      <style type="text/css" media="print">
        {`
          @page { size: auto; margin: 0mm; }
          body { margin: 1cm; }
        `}
      </style>

      {/* --- PRINTABLE A4 ORDER (Only visible when printing) --- */}
      <div
        className="hidden print:block w-full bg-white text-black p-4 font-sans"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >

        {/* Company Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">PrintPack</h1>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1">Premium Quality Packaging</p>
            <div className="mt-3 text-xs text-slate-600 space-y-0.5">
              <p>123 Industrial Estate, Phase 1</p>
              <p>Mumbai, Maharashtra 400001</p>
              <p>GSTIN: 27AABCU9603R1ZX</p>
              <p>Phone: +91 98765 43210</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-black text-slate-200 uppercase tracking-widest">ORDER</h2>
            <div className="mt-4 bg-slate-50 border border-slate-200 p-3 rounded text-left inline-block min-w-[200px]">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Order Number</p>
              <p className="text-lg font-black text-slate-800">{displayData.order_number}</p>
              <div className="h-px bg-slate-200 my-2"></div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Order Date</p>
              <p className="text-sm font-bold text-slate-800">{new Date(displayData.created_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
            </div>
          </div>
        </div>

        {/* Customer & Transport Details */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase border-b border-slate-200 pb-1 mb-2">Billed To</p>
            <h3 className="text-lg font-black text-slate-800">{displayData.customers?.name}</h3>
            <p className="text-sm text-slate-600 mt-1">{displayData.customers?.billing_address}</p>
            <p className="text-sm text-slate-600">{displayData.customers?.city}, {displayData.customers?.state}</p>
            <p className="text-sm text-slate-600 mt-1">Mobile: {displayData.customers?.mobile}</p>
            {displayData.customers?.gst_number && <p className="text-sm font-bold text-slate-700 mt-1">GSTIN: {displayData.customers?.gst_number}</p>}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase border-b border-slate-200 pb-1 mb-2">Shipping Information</p>
            <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">Mode:</span> {displayData.transport_mode || 'Self Pickup'}</p>
            {displayData.transport_mode === 'Transporter' && (
              <p className="text-sm text-slate-600 mt-1"><span className="font-bold text-slate-800">Transporter:</span> {displayData.transporter_name}</p>
            )}
            <p className="text-sm text-slate-600 mt-1"><span className="font-bold text-slate-800">Order Status:</span> {displayData.status}</p>

            <p className="text-sm text-slate-600 mt-1">
              <span className="font-bold text-slate-800">Payment Status:</span>{' '}
              {balanceDue === 0 ? (
                <span className="text-green-600 font-bold uppercase text-[11px] tracking-wide ml-1">Fully Paid</span>
              ) : totalPaid > 0 ? (
                <span className="text-amber-600 font-bold uppercase text-[11px] tracking-wide ml-1">Partially Paid</span>
              ) : (
                <span className="text-red-600 font-bold uppercase text-[11px] tracking-wide ml-1">Unpaid</span>
              )}
            </p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-sm text-left mb-8 border border-slate-200">
          <thead className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase text-slate-600 font-black">
            <tr>
              <th className="py-3 px-4 w-12 text-center">#</th>
              <th className="py-3 px-4">Product Description</th>
              <th className="py-3 px-4 text-center">HSN/SKU</th>
              <th className="py-3 px-4 text-right">Qty</th>
              <th className="py-3 px-4 text-right">Rate</th>
              <th className="py-3 px-4 text-center">Tax</th>
              <th className="py-3 px-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {displayData.order_items?.map((item: any, idx: number) => (
              <tr key={item.id} className="print-color-adjust-exact">
                <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-slate-100 rounded border border-slate-200 overflow-hidden shrink-0">
                      {item.items?.image_path && <img src={item.items.image_path} alt="" className="h-full w-full object-cover print-color-adjust-exact" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{item.items?.name}</p>
                      <p className="text-[9px] text-slate-500 uppercase">{item.items?.sub_categories?.name}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-center font-mono text-xs text-slate-600">{item.items?.sku}</td>
                <td className="py-3 px-4 text-right font-black text-slate-800">{item.quantity_ordered}</td>
                <td className="py-3 px-4 text-right text-slate-700">₹{item.unit_price.toLocaleString()}</td>
                <td className="py-3 px-4 text-center text-slate-500">{item.items?.gst_rate}%</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">₹{(item.unit_price * item.quantity_ordered).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financials & Signatures */}
        <div className="flex justify-between items-start">
          <div className="w-1/2">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Declaration</p>
            <p className="text-xs text-slate-500 italic">We declare that this order shows the actual price of the goods described and that all particulars are true and correct.</p>

            <div className="mt-16 text-center w-48">
              <div className="border-t-2 border-slate-300 pt-2 text-xs font-bold text-slate-800">Authorized Signatory</div>
            </div>
          </div>

          <div className="w-80">
            <div className="space-y-2 text-sm border border-slate-200 rounded p-4 bg-slate-50">
              <div className="flex justify-between"><span className="text-slate-600 font-medium">Subtotal</span><span className="font-bold">₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              {discountAmt > 0 && <div className="flex justify-between"><span className="text-slate-600 font-medium">Discount</span><span className="font-bold text-red-600">- ₹{discountAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}

              <div className="h-px bg-slate-200 my-1"></div>

              {displayData.customers?.state === "Maharashtra" ? (
                <>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">CGST</span><span className="text-slate-700">₹{cgstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">SGST</span><span className="text-slate-700">₹{sgstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                </>
              ) : (
                <div className="flex justify-between text-xs"><span className="text-slate-500">IGST</span><span className="text-slate-700">₹{igstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              )}

              <div className="h-px bg-slate-200 my-1"></div>

              <div className="flex justify-between items-center"><span className="font-bold text-slate-800 uppercase">Grand Total</span><span className="text-xl font-black text-slate-900">₹{grandTotal.toLocaleString()}</span></div>

              <div className="flex justify-between text-xs mt-2 pt-2 border-t border-slate-200"><span className="text-slate-500">Paid Amount</span><span className="text-green-700 font-bold">₹{totalPaid.toLocaleString()}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Balance Due</span><span className="text-slate-800 font-black">₹{balanceDue.toLocaleString()}</span></div>
            </div>
            <p className="text-center text-xs font-bold text-slate-400 uppercase mt-4">Thank you for your business!</p>
          </div>
        </div>

      </div>
    </>
  )
}