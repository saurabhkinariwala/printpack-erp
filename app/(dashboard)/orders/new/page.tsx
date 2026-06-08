"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Plus, Trash2, Save, User, MapPin, Receipt, Truck, CreditCard, Search, Image as ImageIcon, X, Layers, Minus, Calendar, Hash, Star, Filter, ArrowDownAZ, ArrowUpZA } from "lucide-react"
import { usePermissions } from "@/hooks/usePermissions"

const INDIAN_STATES = [
  "Maharashtra", "Andhra Pradesh", "Karnataka", "Tamil Nadu", "Telangana", "Kerala",
  "Gujarat", "Rajasthan", "Madhya Pradesh", "Delhi", "Uttar Pradesh", "West Bengal",
  "Bihar", "Punjab", "Haryana", "Odisha", "Assam", "Goa", "Other"
];

type Taxonomy = {
  id: string; name: string;
  sub_categories: { id: string; name: string; sub_sub_categories: { id: string; name: string }[] }[];
};

export default function NewOrderPage() {
  const router = useRouter()
  const supabase = createClient()

  const { isCategoryAllowed } = usePermissions()

  // --- CORE STATE ---
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

  // Catalog Filter State
  const [taxonomy, setTaxonomy] = useState<Taxonomy[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<"A-Z" | "Z-A">("A-Z")
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [selectedSubCats, setSelectedSubCats] = useState<string[]>([])
  const [selectedSubSubCats, setSelectedSubSubCats] = useState<string[]>([])
  const [appliedFilters, setAppliedFilters] = useState({ cats: [] as string[], subs: [] as string[], subSubs: [] as string[] })

  // VIP/FAVORITE CUSTOMER AUTOCOMPLETE
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
        .eq('is_favorite', true)
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
    setIsLoadingCatalog(true);

    const [itemsRes, taxRes] = await Promise.all([
      supabase.from('items').select(`
        id, name, sku, price, gst_rate, image_path, pack_size,
        sub_categories(id, name, categories(id, name)),
        sub_sub_categories(id, name),
        stock(quantity, locations(name))
      `),
      supabase.from('categories').select(`
        id, name, sub_categories ( id, name, sub_sub_categories ( id, name ) )
      `).order('name')
    ]);

    if (taxRes.data) setTaxonomy(taxRes.data as unknown as Taxonomy[]);

    const { data: orderData } = await supabase
      .from('order_items')
      .select(`item_id, quantity_ordered, orders!inner(status), dispatch_items(quantity_dispatched)`)
      .neq('orders.status', 'Completed');

    const pendingMap: Record<string, number> = {};
    if (orderData) {
      orderData.forEach((row: any) => {
        const dispatched = row.dispatch_items?.reduce((sum: number, di: any) => sum + di.quantity_dispatched, 0) || 0;
        const pending = row.quantity_ordered - dispatched;
        if (pending > 0) pendingMap[row.item_id] = (pendingMap[row.item_id] || 0) + pending;
      });
    }
    setPendingQtys(pendingMap);

    if (itemsRes.data) {
      const permitted = itemsRes.data.filter((item: any) =>
        isCategoryAllowed(item.sub_categories?.categories?.name)
      );
      setCatalogItems(permitted);
    }

    setIsLoadingCatalog(false);
  }

  const handleApplyFilters = () => {
    setAppliedFilters({ cats: selectedCats, subs: selectedSubCats, subSubs: selectedSubSubCats });
    setIsFilterOpen(false);
  };

  const handleClearFilters = () => {
    setSelectedCats([]); setSelectedSubCats([]); setSelectedSubSubCats([]);
    setAppliedFilters({ cats: [], subs: [], subSubs: [] });
    setSortOrder("A-Z"); setIsFilterOpen(false);
  };

  const availableSubCats = taxonomy
    .filter(c => appliedFilters.cats.length === 0 || appliedFilters.cats.includes(c.id))
    .flatMap(c => c.sub_categories || []);
  const availableSubSubCats = availableSubCats
    .filter(sc => appliedFilters.subs.length === 0 || appliedFilters.subs.includes(sc.id))
    .flatMap(sc => sc.sub_sub_categories || []);

  // Panels for filter — use staging state (selectedCats etc)
  const panelSubCats = taxonomy
    .filter(c => selectedCats.length === 0 || selectedCats.includes(c.id))
    .flatMap(c => c.sub_categories || []);
  const panelSubSubCats = panelSubCats
    .filter(sc => selectedSubCats.length === 0 || selectedSubCats.includes(sc.id))
    .flatMap(sc => sc.sub_sub_categories || []);

  // SMART MULTI-SUBSTRING SEARCH LOGIC with category filters
  const filteredCatalog = catalogItems
    .filter(item => {
      const searchableText = `${item.sub_categories?.name || ''} ${item.sub_sub_categories?.name || ''} ${item.name || ''} ${item.sku || ''}`.toLowerCase();
      const searchTerms = catalogSearch.toLowerCase().trim().split(/\s+/);
      const matchesSearch = searchTerms.every(term => searchableText.includes(term));

      const catId = item.sub_categories?.categories?.id;
      const subCatId = item.sub_categories?.id;
      const subSubCatId = item.sub_sub_categories?.id;

      const matchesCat = appliedFilters.cats.length === 0 || (catId && appliedFilters.cats.includes(catId));
      const matchesSub = appliedFilters.subs.length === 0 || (subCatId && appliedFilters.subs.includes(subCatId));
      const matchesSubSub = appliedFilters.subSubs.length === 0 || (subSubCatId && appliedFilters.subSubs.includes(subSubCatId));

      return matchesSearch && matchesCat && matchesSub && matchesSubSub;
    })
    .sort((a, b) =>
      sortOrder === "A-Z"
        ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        : b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })
    );

  const activeFilterCount = appliedFilters.cats.length + appliedFilters.subs.length + appliedFilters.subSubs.length;

  const handleCatalogAdd = (item: any) => {
    const packSize = item.pack_size || 10;
    const existing = orderItems.find(i => i.item_id === item.id);
    if (existing) updateItem(item.id, 'qty', existing.qty + packSize);
    else setOrderItems([...orderItems, {
      item_id: item.id, image_path: item.image_path || null, name: item.name, sku: item.sku, price: item.price,
      qty: packSize, gst_rate: item.gst_rate || 0, pack_size: packSize,
      path: `${item.sub_categories?.name || ''} › ${item.sub_sub_categories?.name || 'Standard'}`
    }]);
  }

  const handleCatalogRemove = (item: any) => {
    const packSize = item.pack_size || 10;
    const existing = orderItems.find(i => i.item_id === item.id);
    if (!existing) return;
    if (existing.qty <= packSize) removeItem(item.id);
    else updateItem(item.id, 'qty', existing.qty - packSize);
  }

  const updateItem = (id: string, field: string, value: number) =>
    setOrderItems(orderItems.map(i => i.item_id === id ? { ...i, [field]: value } : i))
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
    setIsSaving(true)

    let customerId = null
    const { data: existingCustomer } = await supabase.from('customers').select('id').eq('mobile', customerInfo.mobile).maybeSingle()
    if (existingCustomer) customerId = existingCustomer.id;

    if (customerId) {
      await supabase.from('customers').update({ is_favorite: customerInfo.is_favorite }).eq('id', customerId);
    }

    const { data: newOrderId, error: rpcError } = await supabase.rpc('create_order_atomic', {
      payload: {
        customer_id: customerId,
        customer: {
          name: customerInfo.name,
          mobile: customerInfo.mobile,
          billing_address: customerInfo.address,
          city: customerInfo.city,
          state: customerInfo.state,
          gst_number: customerInfo.gst
        },
        order: {
          order_date: orderDate,
          transport_mode: deliveryInfo.mode,
          transporter_name: deliveryInfo.mode === 'Transporter' ? deliveryInfo.transporter : null,
          discount_value: discountInput,
          total_amount: roundedTotal
        },
        items: orderItems.map(item => ({
          id: item.item_id,
          quantity: item.qty,
          price: item.price
        }))
      }
    });

    if (rpcError) {
      alert("Checkout Failed: " + rpcError.message);
      setIsSaving(false);
      return;
    }

    const validPayments = paymentRecords.filter(p => p.amount && Number(p.amount) > 0);
    if (validPayments.length > 0) {
      const paymentsPayload = validPayments.map(p => ({
        order_id: newOrderId,
        amount: Number(p.amount),
        payment_mode: p.mode,
        transaction_reference: p.reference,
        created_at: new Date(p.date).toISOString()
      }));
      await supabase.from('payments').insert(paymentsPayload);
    }

    alert("Order Created Successfully!")
    router.push(`/orders/${newOrderId}`)
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">

      {/* HEADER WITH ORDER NO & DATE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-6">
          <div><h2 className="text-2xl font-bold text-slate-800">Create New Order</h2><p className="text-sm text-slate-500">Record a new sale, process split payments, and allocate stock.</p></div>
          <div className="hidden md:flex gap-4 border-l border-slate-200 pl-6 ml-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Hash className="w-3 h-3" /> Order No</label>
              <div className="w-36 p-1.5 mt-1 border border-slate-200 bg-slate-50 rounded font-bold text-slate-400 text-sm text-center">
                Auto-generated
              </div>
            </div>
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
                      <td className="py-3 px-4">
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
                            <div className="font-bold text-slate-800">{item.name}</div>
                            <div className="text-[10px] text-blue-600 font-semibold uppercase">{item.path}</div>
                          </div>
                        </div>
                      </td>
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
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-stretch justify-end backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-white flex flex-col h-full shadow-2xl">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><Search className="w-5 h-5 text-blue-600" /> Master Catalog Browser</h3>
              <button onClick={() => setIsCatalogOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            {/* Search + Filter Bar */}
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 shrink-0 flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, SKU, category..."
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <button
                onClick={() => setIsFilterOpen(true)}
                className="relative flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
              >
                <Filter className="h-4 w-4" /> Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Results Count */}
            <div className="px-6 py-2 text-xs text-slate-500 font-medium shrink-0 bg-white border-b border-slate-100">
              Showing <span className="font-bold text-slate-700">{filteredCatalog.length}</span> of {catalogItems.length} items
              {activeFilterCount > 0 && (
                <button onClick={handleClearFilters} className="ml-3 text-blue-600 hover:underline font-semibold">Clear filters</button>
              )}
            </div>

            {/* Catalog Item List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {isLoadingCatalog ? (
                <div className="p-12 text-center text-slate-500">Loading catalog...</div>
              ) : filteredCatalog.length === 0 ? (
                <div className="p-12 text-center text-slate-500">No items match your search or filters.</div>
              ) : (
                filteredCatalog.map((item) => {
                  const inOrder = orderItems.find(i => i.item_id === item.id);
                  const pending = pendingQtys[item.id] || 0;
                  const totalStock = item.stock?.reduce((s: number, st: any) => s + st.quantity, 0) || 0;
                  const available = Math.max(0, totalStock - pending);
                  return (
                    <div key={item.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors ${inOrder ? 'bg-blue-50/50' : ''}`}>
                      <div className="h-12 w-12 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {item.image_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_path} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{item.sku} &bull; {item.sub_categories?.name} › {item.sub_sub_categories?.name || 'Standard'}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Stock: <span className={available > 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{available} avail</span>
                          {pending > 0 && <span className="text-orange-500 ml-1">({pending} pending)</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-blue-600 text-sm">₹{item.price.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400">Pack of {item.pack_size || 10}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {inOrder ? (
                          <>
                            <button onClick={() => handleCatalogRemove(item)} className="w-8 h-8 flex items-center justify-center bg-slate-200 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors"><Minus className="w-4 h-4" /></button>
                            <span className="w-10 text-center font-black text-blue-700 text-sm">{inOrder.qty}</span>
                            <button onClick={() => handleCatalogAdd(item)} className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"><Plus className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <button onClick={() => handleCatalogAdd(item)} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors">+ Add</button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <p className="text-sm font-bold text-slate-700">{orderItems.length} item type(s) selected &bull; {orderItems.reduce((s, i) => s + i.qty, 0)} total units</p>
              <button onClick={() => setIsCatalogOpen(false)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold text-sm">Done</button>
            </div>
          </div>

          {/* FILTER PANEL — slides in over the catalog modal */}
          {isFilterOpen && <div className="fixed inset-0 bg-slate-900/30 z-10" onClick={() => setIsFilterOpen(false)} />}
          <div className={`fixed inset-y-0 right-0 z-20 w-full max-w-xs bg-white shadow-2xl transform transition-transform duration-300 flex flex-col ${isFilterOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold flex items-center gap-2"><Filter className="h-5 w-5 text-blue-600" /> Filter & Sort</h2>
              <button onClick={() => setIsFilterOpen(false)}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div>
                <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Sort Alphabetically</h3>
                <div className="flex gap-2">
                  <button onClick={() => setSortOrder("A-Z")} className={`flex-1 py-2 flex justify-center items-center gap-2 border rounded-md text-sm font-semibold transition-colors ${sortOrder === "A-Z" ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}><ArrowDownAZ className="w-4 h-4" /> A to Z</button>
                  <button onClick={() => setSortOrder("Z-A")} className={`flex-1 py-2 flex justify-center items-center gap-2 border rounded-md text-sm font-semibold transition-colors ${sortOrder === "Z-A" ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}><ArrowUpZA className="w-4 h-4" /> Z to A</button>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Main Categories</h3>
                <div className="space-y-3">
                  {taxonomy.map(c => (
                    <label key={c.id} className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={selectedCats.includes(c.id)} onChange={(e) => setSelectedCats(e.target.checked ? [...selectedCats, c.id] : selectedCats.filter(id => id !== c.id))} className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                      <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {panelSubCats.length > 0 && (
                <div>
                  <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Sub-Categories</h3>
                  <div className="space-y-3 border-l-2 border-slate-100 pl-3">
                    {panelSubCats.map(sc => (
                      <label key={sc.id} className="flex items-center gap-3 cursor-pointer group">
                        <input type="checkbox" checked={selectedSubCats.includes(sc.id)} onChange={(e) => setSelectedSubCats(e.target.checked ? [...selectedSubCats, sc.id] : selectedSubCats.filter(id => id !== sc.id))} className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                        <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{sc.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {panelSubSubCats.length > 0 && (
                <div>
                  <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Variants / Sizes</h3>
                  <div className="space-y-3 border-l-2 border-slate-100 pl-3 ml-3">
                    {panelSubSubCats.map(ssc => (
                      <label key={ssc.id} className="flex items-center gap-3 cursor-pointer group">
                        <input type="checkbox" checked={selectedSubSubCats.includes(ssc.id)} onChange={(e) => setSelectedSubSubCats(e.target.checked ? [...selectedSubSubCats, ssc.id] : selectedSubSubCats.filter(id => id !== ssc.id))} className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                        <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{ssc.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-50 flex gap-3 border-t border-slate-200">
              <button onClick={handleClearFilters} className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">Clear All</button>
              <button onClick={handleApplyFilters} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors">Apply Filters</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}