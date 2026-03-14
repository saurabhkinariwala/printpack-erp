"use client"

import { useState, useEffect, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Edit2, Image as ImageIcon, UploadCloud, Save, X, Loader2, Layers, MapPin, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type Stock = { quantity: number; locations: { id: string; name: string } };
type Item = {
  id: string; name: string; sku: string; price: number; pack_size: number; image_path: string;
  sub_sub_categories?: { name: string };
  stock?: Stock[];
};

type SortConfig = { key: 'name' | 'price' | null; direction: 'asc' | 'desc' };

export default function CategoryProductsPage({ params }: { params: Promise<any> }) {
  const resolvedParams = use(params);
  const targetCategoryId = resolvedParams.subCategoryId || resolvedParams.id;
  
  const [items, setItems] = useState<Item[]>([]);
  const [pendingQtys, setPendingQtys] = useState<Record<string, number>>({});
  const [categoryName, setCategoryName] = useState("Loading...");
  const [hasChildren, setHasChildren] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Search & Sort State
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });
  
  // Edit Modal State
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ 
    name: "", sku: "", price: 0, pack_size: 10, image_path: "",
    stock: [] as { location_id: string; name: string; quantity: number }[]
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function fetchCategoryData() {
      if (!targetCategoryId) {
        setCategoryName("All");
        setIsLoading(false);
        return;
      }

      let isLeaf = true;
      let currentCatName = "Selected";

      // 1. Check if it's a Sub-Category AND if it has children
      const { data: subCat } = await supabase.from('sub_categories').select('name, sub_sub_categories(id)').eq('id', targetCategoryId).maybeSingle();
      
      if (subCat) {
        currentCatName = subCat.name;
        if (subCat.sub_sub_categories && subCat.sub_sub_categories.length > 0) {
          isLeaf = false; // It has children, so we shouldn't show products here
        }
      } else {
        // It must be a Sub-Sub-Category
        const { data: subSubCat } = await supabase.from('sub_sub_categories').select('name').eq('id', targetCategoryId).maybeSingle();
        if (subSubCat) currentCatName = subSubCat.name;
      }
      
      setCategoryName(currentCatName);
      setHasChildren(!isLeaf);

      if (!isLeaf) {
        setItems([]);
        setIsLoading(false);
        return;
      }

      // 2. Fetch Items for this leaf node
      const { data: itemsData } = await supabase
        .from('items')
        .select(`
          id, name, sku, price, pack_size, image_path,
          sub_sub_categories (name),
          stock ( quantity, locations ( id, name ) )
        `)
        .or(`sub_category_id.eq.${targetCategoryId},sub_sub_category_id.eq.${targetCategoryId}`);
      
      if (itemsData) setItems(itemsData as unknown as Item[]);

      // 3. Fetch Pending Orders for Available Qty math
      const { data: orderData } = await supabase.from('order_items').select(`
        item_id, quantity_ordered, orders!inner(status), dispatch_items(quantity_dispatched)
      `).neq('orders.status', 'Completed');

      const pendingMap: Record<string, number> = {};
      if (orderData) {
        orderData.forEach((row: any) => {
          const dispatched = row.dispatch_items?.reduce((sum: number, di: any) => sum + di.quantity_dispatched, 0) || 0;
          const pending = row.quantity_ordered - dispatched;
          if (pending > 0) pendingMap[row.item_id] = (pendingMap[row.item_id] || 0) + pending;
        });
      }
      setPendingQtys(pendingMap);
      setIsLoading(false);
    }
    
    fetchCategoryData();
  }, [supabase, targetCategoryId]);

  // --- SORT & FILTER LOGIC ---
  const handleSort = (key: 'name' | 'price') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: 'name' | 'price' }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 inline-block" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-blue-600 ml-1 inline-block" /> 
      : <ArrowDown className="w-3 h-3 text-blue-600 ml-1 inline-block" />;
  };

  let filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.sku.toLowerCase().includes(search.toLowerCase())
  );

  filteredItems.sort((a, b) => {
    if (sortConfig.key === 'name') {
      return sortConfig.direction === 'asc' 
        ? a.name.localeCompare(b.name, undefined, {numeric: true}) 
        : b.name.localeCompare(a.name, undefined, {numeric: true});
    }
    if (sortConfig.key === 'price') {
      return sortConfig.direction === 'asc' ? a.price - b.price : b.price - a.price;
    }
    return 0;
  });

  // --- EDIT LOGIC ---
  const openEditModal = (item: Item) => {
    setEditingItem(item);
    const mappedStock = item.stock?.map(s => ({ location_id: s.locations.id, name: s.locations.name, quantity: s.quantity })) || [];
    setEditForm({ 
      name: item.name, sku: item.sku, price: item.price, 
      pack_size: item.pack_size || 10, image_path: item.image_path || "", stock: mappedStock
    });
    setUploadFile(null); 
  };

  const handleStockChange = (locationId: string, newQty: number) => {
    setEditForm(prev => ({ ...prev, stock: prev.stock.map(s => s.location_id === locationId ? { ...s, quantity: newQty } : s) }));
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    let finalImagePath = editForm.image_path;

    if (uploadFile) {
      const fileExt = uploadFile.name.split('.').pop();
      const fileName = `${editingItem.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, uploadFile, { cacheControl: '3600', upsert: true });
      if (uploadError) { alert("Error uploading image: " + uploadError.message); setIsSaving(false); return; }
      const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
      finalImagePath = publicUrlData.publicUrl;
    }

    const { error: itemError } = await supabase.from('items').update({ 
        name: editForm.name, sku: editForm.sku, price: editForm.price, pack_size: editForm.pack_size, image_path: finalImagePath 
    }).eq('id', editingItem.id);

    if (itemError) { alert("Error saving product: " + itemError.message); setIsSaving(false); return; }

    if (editForm.stock.length > 0) {
      const stockPayload = editForm.stock.map(s => ({ item_id: editingItem.id, location_id: s.location_id, quantity: s.quantity }));
      await supabase.from('stock').upsert(stockPayload, { onConflict: 'item_id, location_id' });
    }

    setItems(items.map(i => {
      if (i.id !== editingItem.id) return i;
      return { ...i, ...editForm, image_path: finalImagePath, stock: editForm.stock.map(s => ({ quantity: s.quantity, locations: { id: s.location_id, name: s.name } })) };
    }));
    
    setEditingItem(null); setIsSaving(false);
  };

  return (
    <div className="flex flex-col gap-6 pb-20 max-w-7xl mx-auto">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{categoryName} Products</h2>
          <p className="text-sm text-slate-500">Manage items, edit details, adjust stock, and upload images.</p>
        </div>
        {!hasChildren && (
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search products or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-md outline-none focus:border-blue-500 w-full" />
          </div>
        )}
      </div>

      {hasChildren ? (
        <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-12 flex flex-col items-center justify-center text-center">
          <Layers className="w-12 h-12 text-blue-200 mb-4" />
          <h3 className="text-lg font-bold text-slate-700">Please Select a Variant</h3>
          <p className="text-sm text-slate-500 max-w-sm mt-2">
            The <b>{categoryName}</b> category has multiple variants. Please click on a specific sub-category (e.g. 400gm, 1kg) in the sidebar to view and edit its products.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold select-none">
                <tr>
                  <th className="px-6 py-4 w-16">Image</th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('name')}>
                    Product Details <SortIcon columnKey="name" />
                  </th>
                  <th className="px-6 py-4">Stock by Location (ACT / AVL)</th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('price')}>
                    Unit Price <SortIcon columnKey="price" />
                  </th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">Loading {categoryName} items...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No products found.</td></tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="h-12 w-12 rounded border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                          {item.image_path ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={item.image_path} alt={item.name} className="h-full w-full object-cover" />
                          ) : <ImageIcon className="h-5 w-5 text-slate-300" />}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="font-bold text-slate-800">{item.name}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{item.sku}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-blue-600 font-semibold uppercase">{item.sub_sub_categories?.name || 'Standard'}</span>
                          <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">Pack: {item.pack_size || 10}</span>
                        </div>
                      </td>
                      
                      {/* Actual & Available Stock Display */}
                      <td className="px-6 py-3">
                        <div className="flex flex-col gap-1.5 max-w-[300px]">
                          {!item.stock || item.stock.length === 0 ? (
                            <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded w-fit">Out of Stock</span>
                          ) : (
                            (() => {
                              let remainingPending = pendingQtys[item.id] || 0;
                              return item.stock.map(s => {
                                const locActual = s.quantity;
                                const locDeduction = Math.min(locActual, remainingPending);
                                remainingPending -= locDeduction;
                                const realAvailable = locActual - locDeduction;

                                return (
                                  <div key={s.locations.id} className="flex items-center justify-between text-[11px] bg-slate-50 border border-slate-100 px-2 py-1 rounded">
                                    <span className="font-semibold text-slate-700 flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400"/>{s.locations.name}</span>
                                    <div className="flex gap-3 font-mono">
                                      <span className="text-slate-500">ACT: {locActual}</span>
                                      <span className={`font-bold ${realAvailable > 0 ? 'text-blue-600' : 'text-red-500'}`}>AVL: {realAvailable}</span>
                                    </div>
                                  </div>
                                )
                              });
                            })()
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-3 text-right font-bold text-slate-800">₹{item.price.toLocaleString()}</td>
                      <td className="px-6 py-3 text-center">
                        <button onClick={() => openEditModal(item)} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 rounded text-xs font-bold transition-all">Edit</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit2 className="w-5 h-5 text-blue-600"/> Edit Product Details</h2>
              <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              
              <div className="flex gap-6">
                <div className="w-1/3 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 hover:bg-slate-100 transition-colors relative h-40">
                  {uploadFile ? (
                    <p className="text-xs font-bold text-green-600 text-center">New Image Ready</p>
                  ) : editForm.image_path ? (
                    <div className="flex flex-col items-center w-full h-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editForm.image_path} alt="Current" className="h-full w-full object-contain mb-1" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-slate-400 text-center">
                      <UploadCloud className="h-6 w-6 mb-1" />
                      <p className="text-[10px] font-semibold">Upload Image</p>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={(e) => { if (e.target.files && e.target.files[0]) setUploadFile(e.target.files[0]) }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                </div>

                <div className="w-2/3 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Product Name</label>
                    <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-semibold outline-none focus:border-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">SKU</label>
                      <input type="text" value={editForm.sku} onChange={e => setEditForm({...editForm, sku: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Price (₹)</label>
                      <input type="number" value={editForm.price} onChange={e => setEditForm({...editForm, price: Number(e.target.value)})} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold outline-none focus:border-blue-500" />
                    </div>
                  </div>
                </div>
              </div>

              {editForm.stock.length > 0 && (
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-600"/> Adjust Actual Stock Levels</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {editForm.stock.map(s => (
                      <div key={s.location_id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-600">{s.name}</span>
                        <input 
                          type="number" 
                          value={s.quantity} 
                          onChange={(e) => handleStockChange(s.location_id, Number(e.target.value))}
                          className="w-20 p-1.5 border border-slate-300 rounded text-right text-sm font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button onClick={() => setEditingItem(null)} className="px-6 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSaveEdit} disabled={isSaving} className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 flex justify-center items-center gap-2">
                {isSaving ? <><Loader2 className="w-4 h-4 animate-spin"/> Saving...</> : <><Save className="w-4 h-4"/> Save All Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}