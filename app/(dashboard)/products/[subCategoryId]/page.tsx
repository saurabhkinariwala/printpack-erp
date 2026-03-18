"use client"

import { useState, useEffect, use, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Search, Edit2, Image as ImageIcon, UploadCloud, Save, X, Loader2,
  Layers, MapPin, Plus, FileSpreadsheet, Download, CheckCircle, AlertTriangle, Info, Package
} from "lucide-react";
import * as XLSX from "xlsx";

type Stock = { quantity: number; locations: { id: string; name: string } };
type Item = {
  id: string; name: string; sku: string; price: number; pack_size: number; image_path: string;
  sub_sub_categories?: { name: string };
  stock?: Stock[];
};
type Location = { id: string; name: string; type: string };
type ImportRow = {
  rowNum: number; category: string; subCategory: string; subSubCategory: string;
  name: string; sku: string; price: number; gstRate: number; packSize: number;
  godownStock: number; headOfficeStock: number; imageUrl: string;
  status: "pending" | "success" | "error" | "skipped"; message: string;
};

const col = (v: any): string => String(v ?? "").trim();
const num = (v: any, def = 0): number => { const n = Number(v); return isNaN(n) ? def : n; };

export default function CategoryProductsPage({ params }: { params: Promise<any> }) {
  const resolvedParams = use(params);
  const targetCategoryId = resolvedParams.subCategoryId || resolvedParams.id;

  const [items, setItems] = useState<Item[]>([]);
  const [pendingQtys, setPendingQtys] = useState<Record<string, number>>({});
  const [categoryName, setCategoryName] = useState("Loading...");
  const [hasChildren, setHasChildren] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);

  const [search, setSearch] = useState("");

  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ name: "", sku: "", price: 0, pack_size: 10, image_path: "", stock: [] as { location_id: string; name: string; quantity: number }[] });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", sku: "", price: 0, gst_rate: 18, pack_size: 10, image_path: "", stock: {} as Record<string, number> });
  const [addFile, setAddFile] = useState<File | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importState, setImportState] = useState<"idle" | "parsed" | "importing" | "done">("idle");
  const [importProgress, setImportProgress] = useState(0);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  useEffect(() => {
    async function fetchAll() {
      const { data: locData } = await supabase.from("locations").select("id, name, type").order("name");
      if (locData) setLocations(locData);

      if (!targetCategoryId) { setCategoryName("All"); setIsLoading(false); return; }

      let isLeaf = true;
      let currentCatName = "Selected";

      const { data: subCat } = await supabase.from("sub_categories").select("name, sub_sub_categories(id)").eq("id", targetCategoryId).maybeSingle();

      if (subCat) {
        currentCatName = subCat.name;
        if (subCat.sub_sub_categories && subCat.sub_sub_categories.length > 0) isLeaf = false;
      } else {
        const { data: ssc } = await supabase.from("sub_sub_categories").select("name").eq("id", targetCategoryId).maybeSingle();
        if (ssc) currentCatName = ssc.name;
      }

      setCategoryName(currentCatName);
      setHasChildren(!isLeaf);

      if (!isLeaf) { setItems([]); setIsLoading(false); return; }

      const { data: itemsData } = await supabase.from("items").select(`
        id, name, sku, price, pack_size, image_path, sub_sub_categories(name), stock(quantity, locations(id, name))
      `).or(`sub_category_id.eq.${targetCategoryId},sub_sub_category_id.eq.${targetCategoryId}`);

      if (itemsData) setItems(itemsData as unknown as Item[]);

      // FETCH PENDING (Ignoring Cancelled/Completed universally)
      const { data: orderData } = await supabase.from("order_items").select(`
        item_id, quantity_ordered, orders!inner(status), dispatch_items(quantity_dispatched)
      `).neq("orders.status", "Completed").neq("orders.status", "Cancelled");

      const pendingMap: Record<string, number> = {};
      if (orderData) {
        orderData.forEach((row: any) => {
          const dispatched = row.dispatch_items?.reduce((s: number, di: any) => s + di.quantity_dispatched, 0) || 0;
          const pending = row.quantity_ordered - dispatched;
          if (pending > 0) pendingMap[row.item_id] = (pendingMap[row.item_id] || 0) + pending;
        });
      }
      setPendingQtys(pendingMap);
      setIsLoading(false);
    }
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCategoryId]);

  let filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()));
  filteredItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const groupedItems = filteredItems.reduce((acc, item) => {
    const groupName = item.sub_sub_categories?.name || "Standard";
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(item);
    return acc;
  }, {} as Record<string, Item[]>);

  const openEditModal = (item: Item) => {
    setEditingItem(item);
    const mappedStock = item.stock?.map(s => ({ location_id: s.locations.id, name: s.locations.name, quantity: s.quantity })) || [];
    setEditForm({ name: item.name, sku: item.sku, price: item.price, pack_size: item.pack_size || 10, image_path: item.image_path || "", stock: mappedStock });
    setUploadFile(null);
  };

  const handleStockChange = (locationId: string, newQty: number) => { setEditForm(prev => ({ ...prev, stock: prev.stock.map(s => s.location_id === locationId ? { ...s, quantity: newQty } : s) })); };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    let finalImagePath = editForm.image_path;

    if (uploadFile) {
      const fileExt = uploadFile.name.split(".").pop();
      const fileName = `${editingItem.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(fileName, uploadFile, { cacheControl: "3600", upsert: true });
      if (uploadError) { alert("Error uploading image: " + uploadError.message); setIsSaving(false); return; }
      const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(fileName);
      finalImagePath = publicUrlData.publicUrl;
    }

    const { error: itemError } = await supabase.from("items").update({ name: editForm.name, sku: editForm.sku, price: editForm.price, pack_size: editForm.pack_size, image_path: finalImagePath }).eq("id", editingItem.id);
    if (itemError) { alert("Error saving product: " + itemError.message); setIsSaving(false); return; }

    if (editForm.stock.length > 0) {
      const stockPayload = editForm.stock.map(s => ({ item_id: editingItem.id, location_id: s.location_id, quantity: s.quantity }));
      await supabase.from("stock").upsert(stockPayload, { onConflict: "item_id, location_id" });
    }

    setItems(items.map(i => {
      if (i.id !== editingItem.id) return i;
      return { ...i, ...editForm, image_path: finalImagePath, stock: editForm.stock.map(s => ({ quantity: s.quantity, locations: { id: s.location_id, name: s.name } })) };
    }));
    setEditingItem(null); setIsSaving(false);
  };

  const handleAddProduct = async () => {
    if (!addForm.name || !addForm.sku) return alert("Product Name and SKU are required.");
    if (!addForm.price || addForm.price <= 0) return alert("Price must be greater than 0.");
    setIsAdding(true);

    let finalImagePath = addForm.image_path;
    if (addFile) {
      const fileExt = addFile.name.split(".").pop();
      const fileName = `new-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(fileName, addFile, { cacheControl: "3600", upsert: true });
      if (!uploadError) finalImagePath = supabase.storage.from("product-images").getPublicUrl(fileName).data.publicUrl;
    }

    const { data: ssc } = await supabase.from("sub_sub_categories").select("id, sub_category_id").eq("id", targetCategoryId).maybeSingle();
    const itemPayload: any = { name: addForm.name, sku: addForm.sku, price: addForm.price, gst_rate: addForm.gst_rate, pack_size: addForm.pack_size, image_path: finalImagePath || null };
    if (ssc) { itemPayload.sub_category_id = ssc.sub_category_id; itemPayload.sub_sub_category_id = targetCategoryId; } 
    else { itemPayload.sub_category_id = targetCategoryId; itemPayload.sub_sub_category_id = null; }

    const { data: newItem, error: itemError } = await supabase.from("items").insert([itemPayload]).select().single();
    if (itemError) { alert("Error creating product: " + itemError.message); setIsAdding(false); return; }

    const stockEntries = Object.entries(addForm.stock).filter(([, qty]) => qty > 0);
    if (stockEntries.length > 0) await supabase.from("stock").insert(stockEntries.map(([locId, qty]) => ({ item_id: newItem.id, location_id: locId, quantity: qty })));

    const { data: refreshedItem } = await supabase.from("items").select(`id, name, sku, price, pack_size, image_path, sub_sub_categories(name), stock(quantity, locations(id, name))`).eq("id", newItem.id).single();
    if (refreshedItem) setItems(prev => [...prev, refreshedItem as unknown as Item]);

    setIsAddOpen(false); setAddForm({ name: "", sku: "", price: 0, gst_rate: 18, pack_size: 10, image_path: "", stock: {} }); setAddFile(null); setIsAdding(false);
  };

  const handleExcelParse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result; const wb = XLSX.read(data, { type: "binary" }); const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (raw.length < 3) { alert("No data rows found. Please start data from Row 3."); return; }

      const headers: string[] = raw[0].map((h: any) => String(h).toLowerCase().trim());
      const getCol = (row: any[], name: string) => { const idx = headers.findIndex(h => h.includes(name.toLowerCase())); return idx >= 0 ? row[idx] : ""; };

      const parsed: ImportRow[] = [];
      for (let i = 2; i < raw.length; i++) {
        const row = raw[i];
        if (row.every((cell: any) => !String(cell).trim())) continue;
        const skuVal = col(getCol(row, "sku")); const nameVal = col(getCol(row, "product name") || getCol(row, "name")); const catVal = col(getCol(row, "category")); const subCatVal = col(getCol(row, "sub category") || getCol(row, "sub_category")); const priceVal = num(getCol(row, "price"));

        let status: ImportRow["status"] = "pending"; let message = "";
        if (!skuVal) { status = "error"; message = "SKU is required"; } else if (!nameVal) { status = "error"; message = "Product Name is required"; } else if (!catVal) { status = "error"; message = "Category is required"; } else if (!subCatVal) { status = "error"; message = "Sub Category is required"; } else if (priceVal <= 0) { status = "error"; message = "Price must be > 0"; }

        parsed.push({ rowNum: i + 1, category: catVal, subCategory: subCatVal, subSubCategory: col(getCol(row, "sub sub") || getCol(row, "sub_sub")), name: nameVal, sku: skuVal, price: priceVal, gstRate: num(getCol(row, "gst"), 18), packSize: num(getCol(row, "pack"), 10) || 10, godownStock: num(getCol(row, "godown")), headOfficeStock: num(getCol(row, "head office") || getCol(row, "head_office")), imageUrl: col(getCol(row, "image")), status, message });
      }
      setImportRows(parsed); setImportState("parsed");
    };
    reader.readAsBinaryString(file); e.target.value = "";
  };

  const handleImport = async () => {
    setImportState("importing"); setImportProgress(0);
    const catCache: Record<string, string> = {}; const subCatCache: Record<string, string> = {}; const subSubCatCache: Record<string, string> = {}; const locCache: Record<string, string> = {};          
    const { data: locData } = await supabase.from("locations").select("id, name"); if (locData) locData.forEach((l: any) => { locCache[l.name.toLowerCase()] = l.id; });
    const { data: allCats } = await supabase.from("categories").select("id, name"); if (allCats) allCats.forEach((c: any) => { catCache[c.name.toLowerCase()] = c.id; });
    const validRows = importRows.filter(r => r.status !== "error"); const updated: ImportRow[] = [...importRows];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]; const rowIdx = updated.findIndex(r => r.rowNum === row.rowNum);
      try {
        const catKey = row.category.toLowerCase();
        if (!catCache[catKey]) {
          const { data: existingCat } = await supabase.from("categories").select("id").ilike("name", row.category).maybeSingle();
          if (existingCat) catCache[catKey] = existingCat.id;
          else { const { data: newCat } = await supabase.from("categories").insert({ name: row.category }).select().single(); catCache[catKey] = newCat!.id; }
        }
        const catId = catCache[catKey];
        const subCatKey = `${catId}::${row.subCategory.toLowerCase()}`;
        if (!subCatCache[subCatKey]) {
          const { data: existingSub } = await supabase.from("sub_categories").select("id").eq("category_id", catId).ilike("name", row.subCategory).maybeSingle();
          if (existingSub) subCatCache[subCatKey] = existingSub.id;
          else { const { data: newSub } = await supabase.from("sub_categories").insert({ category_id: catId, name: row.subCategory }).select().single(); subCatCache[subCatKey] = newSub!.id; }
        }
        const subCatId = subCatCache[subCatKey];

        let subSubCatId: string | null = null;
        if (row.subSubCategory) {
          const sscKey = `${subCatId}::${row.subSubCategory.toLowerCase()}`;
          if (!subSubCatCache[sscKey]) {
            const { data: existingSSC } = await supabase.from("sub_sub_categories").select("id").eq("sub_category_id", subCatId).ilike("name", row.subSubCategory).maybeSingle();
            if (existingSSC) subSubCatCache[sscKey] = existingSSC.id;
            else { const { data: newSSC } = await supabase.from("sub_sub_categories").insert({ sub_category_id: subCatId, name: row.subSubCategory }).select().single(); subSubCatCache[sscKey] = newSSC!.id; }
          }
          subSubCatId = subSubCatCache[`${subCatId}::${row.subSubCategory.toLowerCase()}`];
        }

        const itemPayload: any = { name: row.name, sku: row.sku, price: row.price, gst_rate: row.gstRate, pack_size: row.packSize, sub_category_id: subSubCatId ? null : subCatId, sub_sub_category_id: subSubCatId, ...(row.imageUrl ? { image_path: row.imageUrl } : {}) };
        const { data: existingItem } = await supabase.from("items").select("id").eq("sku", row.sku).maybeSingle();
        let itemId: string;

        if (existingItem) { await supabase.from("items").update(itemPayload).eq("id", existingItem.id); itemId = existingItem.id; updated[rowIdx] = { ...updated[rowIdx], status: "success", message: "Updated existing product" }; } 
        else { const { data: newItem } = await supabase.from("items").insert(itemPayload).select().single(); itemId = newItem!.id; updated[rowIdx] = { ...updated[rowIdx], status: "success", message: "Created new product" }; }

        const stockEntries = [];
        if (row.godownStock > 0) { const godownId = Object.entries(locCache).find(([name]) => name.includes("godown"))?.[1]; if (godownId) stockEntries.push({ item_id: itemId, location_id: godownId, quantity: row.godownStock }); }
        if (row.headOfficeStock > 0) { const hoId = Object.entries(locCache).find(([name]) => name.includes("head"))?.[1]; if (hoId) stockEntries.push({ item_id: itemId, location_id: hoId, quantity: row.headOfficeStock }); }
        if (stockEntries.length > 0) await supabase.from("stock").upsert(stockEntries, { onConflict: "item_id, location_id" });

      } catch (err: any) { updated[rowIdx] = { ...updated[rowIdx], status: "error", message: err.message || "Unknown error" }; }
      setImportRows([...updated]); setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
    }
    setImportState("done");
  };

  const importSummary = { total: importRows.length, valid: importRows.filter(r => r.status !== "error" || importState === "idle").length, errors: importRows.filter(r => r.status === "error").length, success: importRows.filter(r => r.status === "success").length };

  return (
    <div className="flex flex-col gap-6 pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{categoryName} Gallery</h2>
          <p className="text-sm text-slate-500">Manage visually rich product cards, stock, and pricing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!hasChildren && (
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Search products or SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 w-full font-medium" />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setIsAddOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"><Plus className="h-4 w-4" /> Add Product</button>
            <button onClick={() => setIsImportOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"><FileSpreadsheet className="h-4 w-4" /> Import Excel</button>
          </div>
        </div>
      </div>

      {hasChildren ? (
        <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-12 flex flex-col items-center justify-center text-center">
          <Layers className="w-12 h-12 text-blue-200 mb-4" />
          <h3 className="text-lg font-bold text-slate-700">Please Select a Variant</h3>
          <p className="text-sm text-slate-500 max-w-sm mt-2">The <b>{categoryName}</b> category has multiple variants. Please click a specific sub-category in the sidebar.</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 font-bold gap-2"><Loader2 className="w-5 h-5 animate-spin"/> Loading Gallery...</div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-16 text-center">
          <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No products found.</p>
          <button onClick={() => setIsAddOpen(true)} className="mt-3 text-blue-600 text-sm font-bold hover:underline flex items-center gap-1 mx-auto"><Plus className="h-4 w-4" /> Add the first product</button>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedItems).map(([groupName, groupItems]) => (
            <div key={groupName}>
              <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-200 pb-2">
                <Layers className="w-5 h-5 text-blue-600" /> {groupName} <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-2">{groupItems.length}</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                {groupItems.map(item => {
                  let totalACT = 0; let totalAVL = 0; let remainingPending = pendingQtys[item.id] || 0;
                  const locDetails = item.stock?.map(s => {
                    const locActual = s.quantity; const locDeduction = Math.min(locActual, remainingPending); remainingPending -= locDeduction; const realAvailable = locActual - locDeduction;
                    totalACT += locActual; totalAVL += realAvailable;
                    return { name: s.locations.name, act: locActual, avl: realAvailable };
                  }) || [];

                  return (
                    <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible group hover:border-blue-400 hover:shadow-md transition-all flex flex-col relative">
                      <div className="h-48 w-full bg-slate-50 rounded-t-xl overflow-hidden relative">
                        {item.image_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_path} alt={item.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center"><ImageIcon className="w-12 h-12 text-slate-300" /></div>
                        )}
                        <button onClick={() => openEditModal(item)} className="absolute top-2 right-2 bg-white/90 backdrop-blur border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 p-2 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10"><Edit2 className="w-4 h-4" /></button>
                        <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm">Pack of {item.pack_size || 10}</div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex justify-between items-start gap-2 mb-1"><h4 className="font-bold text-slate-800 leading-tight">{item.name}</h4></div>
                        <p className="text-xs text-slate-400 font-mono mb-3">{item.sku}</p>
                        <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-100"><span className="font-black text-slate-800 text-lg">₹{item.price.toLocaleString()}</span></div>
                      </div>
                      <div className="p-3 bg-slate-50 border-t border-slate-100 rounded-b-xl relative group/stock cursor-help">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="text-slate-500 flex items-center gap-1 font-semibold">ACT: {totalACT} <Info className="w-3 h-3 text-slate-400" /></span>
                          <span className={`font-black ${totalAVL > 0 ? "text-green-600" : "text-red-500"}`}>AVL: {totalAVL}</span>
                        </div>
                        <div className="absolute bottom-[calc(100%+8px)] left-0 w-full bg-slate-800 text-white rounded-lg p-2.5 opacity-0 invisible group-hover/stock:opacity-100 group-hover/stock:visible transition-all duration-200 z-20 shadow-xl border border-slate-700 pointer-events-none">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-600 pb-1 mb-1">Department Breakdown</p>
                          {locDetails.length > 0 ? locDetails.map(loc => (
                            <div key={loc.name} className="flex justify-between text-[10px] py-1 border-b border-slate-700 last:border-0 font-mono">
                              <span className="font-medium text-slate-300 truncate pr-2">{loc.name}</span>
                              <span className="shrink-0 text-slate-400">{loc.act} <span className="mx-1">/</span> <span className={loc.avl > 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{loc.avl}</span></span>
                            </div>
                          )) : <div className="text-[10px] text-slate-400 py-1 italic text-center">No stock recorded</div>}
                          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 rotate-45 border-r border-b border-slate-700"></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- ADD MODAL --- */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Plus className="w-5 h-5 text-blue-600" /> Add New Product</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="flex gap-6">
                <div className="w-1/3 relative h-40 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer overflow-hidden">
                  {addFile ? <img src={URL.createObjectURL(addFile)} alt="preview" className="h-full w-full object-cover" /> : addForm.image_path ? <img src={addForm.image_path} alt="preview" className="h-full w-full object-contain" /> : <div className="flex flex-col items-center text-slate-400 text-center px-2"><UploadCloud className="h-8 w-8 mb-2" /><p className="text-xs font-semibold">Upload Image</p></div>}
                  <input type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) setAddFile(e.target.files[0]) }} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
                <div className="w-2/3 space-y-3">
                  <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Product Name *</label><input type="text" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-semibold outline-none focus:border-blue-500" placeholder="e.g. Kaju Badam Mix 400gm" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">SKU *</label><input type="text" value={addForm.sku} onChange={e => setAddForm({ ...addForm, sku: e.target.value })} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:border-blue-500" placeholder="KBM-400" /></div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Price (₹) *</label><input type="number" value={addForm.price || ""} onChange={e => setAddForm({ ...addForm, price: Number(e.target.value) })} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold outline-none focus:border-blue-500" placeholder="0" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">GST Rate (%)</label><select value={addForm.gst_rate} onChange={e => setAddForm({ ...addForm, gst_rate: Number(e.target.value) })} className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 bg-white">{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Pack Size</label><input type="number" value={addForm.pack_size} onChange={e => setAddForm({ ...addForm, pack_size: Number(e.target.value) })} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold outline-none focus:border-blue-500" /></div>
                  </div>
                </div>
              </div>
              {locations.length > 0 && (
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-600" /> Opening Stock by Location</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {locations.map(loc => (
                      <div key={loc.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex justify-between items-center">
                        <div><p className="text-xs font-bold text-slate-600">{loc.name}</p><p className="text-[10px] text-slate-400 uppercase">{loc.type}</p></div>
                        <input type="number" min="0" value={addForm.stock[loc.id] || ""} onChange={e => setAddForm({ ...addForm, stock: { ...addForm.stock, [loc.id]: Number(e.target.value) } })} placeholder="0" className="w-20 p-1.5 border border-slate-300 rounded text-right text-sm font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button onClick={() => setIsAddOpen(false)} className="px-6 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button onClick={handleAddProduct} disabled={isAdding} className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">{isAdding ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Add Product</>}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- IMPORT MODAL --- */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-8">
          <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-emerald-50 shrink-0">
              <div><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Bulk Import from Excel</h2></div>
              <button onClick={() => { setIsImportOpen(false); setImportState("idle"); setImportRows([]); }} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div><p className="font-bold text-slate-700 text-sm flex items-center gap-2"><span className="h-6 w-6 rounded-full bg-slate-800 text-white text-xs font-black flex items-center justify-center">1</span> Download the template</p></div>
                <a href="/printpack-product-import-template.xlsx" download className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold transition-colors shrink-0"><Download className="h-4 w-4" /> Download Template</a>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="font-bold text-slate-700 text-sm flex items-center gap-2 mb-3"><span className="h-6 w-6 rounded-full bg-slate-800 text-white text-xs font-black flex items-center justify-center">2</span> Upload your filled Excel file</p>
                <label className="ml-8 flex items-center gap-3 cursor-pointer p-3 bg-white border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl transition-colors w-fit">
                  <FileSpreadsheet className="h-6 w-6 text-emerald-500 shrink-0" /><div><p className="text-sm font-bold text-slate-700">Click to select .xlsx file</p></div>
                  <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelParse} className="hidden" />
                </label>
              </div>
              {importState !== "idle" && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-slate-700 text-sm flex items-center gap-2"><span className="h-6 w-6 rounded-full bg-slate-800 text-white text-xs font-black flex items-center justify-center">3</span> Review & Import</p>
                    <div className="flex items-center gap-4 text-xs font-bold"><span className="text-slate-600">{importSummary.total} rows</span><span className="text-green-600">{importSummary.success} done</span><span className="text-red-500">{importSummary.errors} errors</span></div>
                  </div>
                  {importState === "importing" && (
                    <div className="mb-4"><div className="flex justify-between text-xs text-slate-500 mb-1"><span>Importing...</span><span>{importProgress}%</span></div><div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-300 rounded-full" style={{ width: `${importProgress}%` }} /></div></div>
                  )}
                  {importState === "done" && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-600 shrink-0" /><p className="text-sm font-bold text-green-700">Import complete! {importSummary.success} products processed.</p></div>
                  )}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-64 overflow-y-auto">
                    <table className="w-full text-xs"><thead className="bg-slate-100 sticky top-0"><tr><th className="text-left px-3 py-2">Row</th><th className="text-left px-3 py-2">SKU</th><th className="text-left px-3 py-2">Name</th><th className="text-center px-3 py-2">Status</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {importRows.map((row, i) => (
                          <tr key={i} className={row.status === "error" ? "bg-red-50" : row.status === "success" ? "bg-green-50" : ""}><td className="px-3 py-2">{row.rowNum}</td><td className="px-3 py-2">{row.sku}</td><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2 text-center">{row.status === "error" ? <AlertTriangle className="h-3 w-3 inline text-red-600" /> : row.status === "success" ? <CheckCircle className="h-3 w-3 inline text-green-600" /> : "Pending"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => { setIsImportOpen(false); setImportState("idle"); setImportRows([]); }} className="px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700">Cancel</button>
              {importState === "parsed" && importSummary.valid > 0 && <button onClick={handleImport} className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold">Import Rows</button>}
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit2 className="w-5 h-5 text-blue-600" /> Edit Product Details</h2>
              <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="flex gap-6">
                <div className="w-1/3 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 hover:bg-slate-100 transition-colors relative h-40">
                  {uploadFile ? <p className="text-xs font-bold text-green-600 text-center">New Image Ready</p> : editForm.image_path ? <img src={editForm.image_path} alt="Current" className="h-full w-full object-contain" /> : <div className="flex flex-col items-center text-slate-400 text-center"><UploadCloud className="h-6 w-6 mb-1" /><p className="text-[10px] font-semibold">Upload Image</p></div>}
                  <input type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]) }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <div className="w-2/3 space-y-3">
                  <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Product Name</label><input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-semibold outline-none focus:border-blue-500" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">SKU</label><input type="text" value={editForm.sku} onChange={e => setEditForm({ ...editForm, sku: e.target.value })} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:border-blue-500" /></div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Price (₹)</label><input type="number" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: Number(e.target.value) })} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold outline-none focus:border-blue-500" /></div>
                  </div>
                </div>
              </div>
              {editForm.stock.length > 0 && (
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-600" /> Adjust Actual Stock Levels</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {editForm.stock.map(s => (
                      <div key={s.location_id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex justify-between items-center"><span className="text-xs font-bold text-slate-600">{s.name}</span><input type="number" value={s.quantity} onChange={e => handleStockChange(s.location_id, Number(e.target.value))} className="w-20 p-1.5 border border-slate-300 rounded text-right text-sm font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button onClick={() => setEditingItem(null)} className="px-6 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSaveEdit} disabled={isSaving} className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">{isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save All Changes</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}