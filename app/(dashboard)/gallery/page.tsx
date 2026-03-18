"use client"

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Filter, X, ArrowDownAZ, ArrowUpZA, Layers, Info, Package, ChevronLeft, ChevronRight, Maximize2, ImageIcon } from "lucide-react";

type Stock = { quantity: number; locations: { id: string; name: string } };
type Item = {
  id: string; name: string; sku: string; price: number; pack_size: number; image_path: string;
  sub_categories?: { id: string, name: string, categories?: { id: string, name: string } };
  sub_sub_categories?: { id: string, name: string };
  stock?: Stock[];
};
type Taxonomy = {
  id: string; name: string;
  sub_categories: { id: string; name: string; sub_sub_categories: { id: string; name: string }[] }[];
};
type Location = { id: string; name: string };

export default function GalleryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pendingQtys, setPendingQtys] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Filter & Sort State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<"A-Z" | "Z-A">("A-Z");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedSubCats, setSelectedSubCats] = useState<string[]>([]);
  const [selectedSubSubCats, setSelectedSubSubCats] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  
  const [qtyOperator, setQtyOperator] = useState<"greater" | "less">("greater");
  const [qtyValue, setQtyValue] = useState<string>("");

  const [appliedFilters, setAppliedFilters] = useState({ 
    cats: [] as string[], subs: [] as string[], subSubs: [] as string[], locs: [] as string[],
    qtyOp: "greater" as "greater" | "less", qtyVal: ""
  });

  // LIGHTBOX CAROUSEL STATE
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      const { data: itemsData } = await supabase.from('items').select(`
        id, name, sku, price, pack_size, image_path,
        sub_categories (id, name, categories (id, name)),
        sub_sub_categories (id, name),
        stock ( quantity, locations ( id, name ) )
      `).order('name');
      if (itemsData) setItems(itemsData as unknown as Item[]);

      const { data: taxData } = await supabase.from('categories').select(`
        id, name, sub_categories ( id, name, sub_sub_categories ( id, name ) )
      `).order('name');
      if (taxData) setTaxonomy(taxData as unknown as Taxonomy[]);

      const { data: locData } = await supabase.from('locations').select('id, name');
      if (locData) setLocations(locData as Location[]);

      const { data: orderData } = await supabase.from('order_items').select(`
        item_id, quantity_ordered, orders!inner(status), dispatch_items(quantity_dispatched)
      `).neq('orders.status', 'Completed').neq('orders.status', 'Cancelled');

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
    fetchData();
  }, [supabase]);

  const handleApplyFilters = () => {
    setAppliedFilters({ cats: selectedCats, subs: selectedSubCats, subSubs: selectedSubSubCats, locs: selectedLocations, qtyOp: qtyOperator, qtyVal: qtyValue });
    setIsFilterOpen(false);
  };

  const handleClearFilters = () => {
    setSelectedCats([]); setSelectedSubCats([]); setSelectedSubSubCats([]); setSelectedLocations([]);
    setQtyOperator("greater"); setQtyValue("");
    setAppliedFilters({ cats: [], subs: [], subSubs: [], locs: [], qtyOp: "greater", qtyVal: "" });
    setSortOrder("A-Z"); setIsFilterOpen(false);
  };

  let filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase());
    const catId = item.sub_categories?.categories?.id;
    const subCatId = item.sub_categories?.id;
    const subSubCatId = item.sub_sub_categories?.id;

    const matchesCat = appliedFilters.cats.length === 0 || (catId && appliedFilters.cats.includes(catId));
    const matchesSub = appliedFilters.subs.length === 0 || (subCatId && appliedFilters.subs.includes(subCatId));
    const matchesSubSub = appliedFilters.subSubs.length === 0 || (subSubCatId && appliedFilters.subSubs.includes(subSubCatId));
    const matchesLoc = appliedFilters.locs.length === 0 || (item.stock && item.stock.some(s => appliedFilters.locs.includes(s.locations.id) && s.quantity > 0));

    let matchesQty = true;
    if (appliedFilters.qtyVal !== "") {
      const totalActualStock = item.stock?.reduce((sum, s) => sum + s.quantity, 0) || 0;
      const compareValue = Number(appliedFilters.qtyVal);
      if (appliedFilters.qtyOp === "greater") { matchesQty = totalActualStock >= compareValue; } 
      else { matchesQty = totalActualStock <= compareValue; }
    }

    return matchesSearch && matchesCat && matchesSub && matchesSubSub && matchesLoc && matchesQty;
  });

  filteredItems.sort((a, b) => sortOrder === "A-Z" ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));

  const groupedItems = filteredItems.reduce((acc, item) => {
    const subCatName = item.sub_categories?.name || "Uncategorized";
    const subSubCatName = item.sub_sub_categories?.name || "Standard"; 
    if (!acc[subCatName]) acc[subCatName] = {};
    if (!acc[subCatName][subSubCatName]) acc[subCatName][subSubCatName] = [];
    acc[subCatName][subSubCatName].push(item);
    return acc;
  }, {} as Record<string, Record<string, Item[]>>);

  const availableSubCats = taxonomy.filter(c => selectedCats.length === 0 || selectedCats.includes(c.id)).flatMap(c => c.sub_categories || []);
  const availableSubSubCats = availableSubCats.filter(sc => selectedSubCats.length === 0 || selectedSubCats.includes(sc.id)).flatMap(sc => sc.sub_sub_categories || []);

  // --- LIGHTBOX CONTROLS ---
  const openLightbox = (item: Item) => {
    const idx = filteredItems.findIndex(i => i.id === item.id);
    if (idx !== -1) setLightboxIndex(idx);
  };

  const closeLightbox = () => setLightboxIndex(null);

  const nextLightboxImage = useCallback(() => {
    setLightboxIndex(prev => prev !== null ? (prev + 1) % filteredItems.length : null);
  }, [filteredItems.length]);

  const prevLightboxImage = useCallback(() => {
    setLightboxIndex(prev => prev !== null ? (prev - 1 + filteredItems.length) % filteredItems.length : null);
  }, [filteredItems.length]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") nextLightboxImage();
      if (e.key === "ArrowLeft") prevLightboxImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, nextLightboxImage, prevLightboxImage]);

  // Derive Lightbox Data safely
  const currentLboxItem = lightboxIndex !== null ? filteredItems[lightboxIndex] : null;
  let lbACT = 0; let lbAVL = 0;
  if (currentLboxItem) {
    let lbPending = pendingQtys[currentLboxItem.id] || 0;
    currentLboxItem.stock?.forEach(s => {
      lbACT += s.quantity;
      const ded = Math.min(s.quantity, lbPending);
      lbPending -= ded;
      lbAVL += (s.quantity - ded);
    });
  }

  return (
    <div className="relative flex flex-col gap-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Products Gallery</h2>
          <p className="text-sm text-slate-500">View real-time catalog availability across all locations.</p>
        </div>
        <div className="flex flex-1 max-w-lg items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search by product name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 w-full shadow-sm" />
          </div>
          <button onClick={() => setIsFilterOpen(true)} className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-4 py-2 rounded-md text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors">
            <Filter className="h-4 w-4" /> Filters
          </button>
        </div>
      </div>

      {isLoading ? <div className="py-20 text-center text-slate-500">Loading catalog & live stock...</div> : (
        <div className="space-y-12">
          {Object.entries(groupedItems).length === 0 && (
            <div className="py-12 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-white">No items match your search or filters.</div>
          )}

          {Object.entries(groupedItems).map(([subCatName, subSubGroups]) => (
            <div key={subCatName} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="border-b-2 border-slate-800 pb-3 mb-6 flex items-end justify-between">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{subCatName}</h2>
                <span className="text-sm font-semibold text-slate-500">{Object.values(subSubGroups).flat().length} Total Items</span>
              </div>
              
              <div className="space-y-10">
                {Object.entries(subSubGroups).map(([subSubCatName, items]) => (
                  <div key={subSubCatName}>
                    {subSubCatName !== "Standard" && (
                      <h3 className="text-lg font-bold text-slate-600 mb-4 pl-3 border-l-4 border-blue-500">{subSubCatName}</h3>
                    )}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {items.map((product) => {
                        let totalACT = 0; let totalAVL = 0; let remainingPending = pendingQtys[product.id] || 0;
                        const locDetails = product.stock?.map(s => {
                          const locActual = s.quantity; const locDeduction = Math.min(locActual, remainingPending); remainingPending -= locDeduction; const realAvailable = locActual - locDeduction;
                          totalACT += locActual; totalAVL += realAvailable;
                          return { name: s.locations.name, act: locActual, avl: realAvailable };
                        }) || [];

                        return (
                          <div key={product.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible group hover:shadow-xl hover:border-blue-400 transition-all flex flex-col relative">
                            
                            {/* --- BIG IMAGE AREA --- */}
                            <div 
                              onClick={() => openLightbox(product)}
                              className="h-64 w-full bg-slate-100 rounded-t-xl overflow-hidden relative cursor-pointer"
                            >
                              {product.image_path ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={product.image_path} alt={product.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center bg-slate-50"><ImageIcon className="w-16 h-16 text-slate-300" /></div>
                              )}
                              
                              {/* Hover overlay hint */}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                <Maximize2 className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                              </div>

                              {/* Pack Size Overlay (Bottom Left) */}
                              <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg shadow-lg border border-white/10 flex items-center gap-1.5">
                                <Layers className="w-3 h-3 text-slate-300"/> Pack of {product.pack_size || 10}
                              </div>

                              {/* Price Overlay (Bottom Right) */}
                              <div className="absolute bottom-3 right-3 bg-blue-600 text-white text-sm font-black px-3 py-1.5 rounded-lg shadow-lg border border-blue-500">
                                ₹{product.price.toLocaleString()}
                              </div>
                            </div>

                            {/* --- CARD DETAILS --- */}
                            <div className="p-4 flex-1 flex flex-col">
                              <h4 className="font-bold text-slate-800 leading-tight mb-1">{product.name}</h4>
                              <p className="text-xs text-slate-400 font-mono">{product.sku}</p>
                            </div>

                            {/* --- UPFRONT STOCK & HOVER TOOLTIP --- */}
                            <div className="p-3 bg-slate-50 border-t border-slate-100 rounded-b-xl relative group/stock cursor-help">
                              <div className="flex justify-between items-center text-xs font-mono">
                                <span className="text-slate-500 flex items-center gap-1.5 font-semibold">
                                  ACT: {totalACT} <Info className="w-3.5 h-3.5 text-slate-400" />
                                </span>
                                <span className={`font-black text-sm ${totalAVL > 0 ? "text-green-600" : "text-red-500"}`}>
                                  AVL: {totalAVL}
                                </span>
                              </div>

                              {/* Dark Tooltip revealing department breakdown */}
                              <div className="absolute bottom-[calc(100%+8px)] left-0 w-full bg-slate-800 text-white rounded-lg p-3 opacity-0 invisible group-hover/stock:opacity-100 group-hover/stock:visible transition-all duration-200 z-20 shadow-2xl border border-slate-700 pointer-events-none">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-600 pb-1.5 mb-1.5 flex justify-between">
                                  <span>Location</span>
                                  <span>ACT / <span className="text-blue-400">AVL</span></span>
                                </p>
                                {locDetails.length > 0 ? locDetails.map(loc => (
                                  <div key={loc.name} className="flex justify-between text-xs py-1 border-b border-slate-700 last:border-0 font-mono">
                                    <span className="font-medium text-slate-300 truncate pr-2">{loc.name}</span>
                                    <span className="shrink-0 text-slate-400">
                                      {loc.act} <span className="mx-1 text-slate-600">/</span> <span className={loc.avl > 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{loc.avl}</span>
                                    </span>
                                  </div>
                                )) : <div className="text-xs text-slate-400 py-2 italic text-center">No stock recorded</div>}
                                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 rotate-45 border-r border-b border-slate-700"></div>
                              </div>
                            </div>

                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- LIGHTBOX CAROUSEL --- */}
      {lightboxIndex !== null && currentLboxItem && (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center selection:bg-blue-500 selection:text-white">
          
          {/* Close Button */}
          <button onClick={closeLightbox} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-50">
            <X className="w-6 h-6" />
          </button>

          {/* Navigation Controls */}
          <button onClick={prevLightboxImage} className="absolute left-4 sm:left-10 top-1/2 -translate-y-1/2 p-3 sm:p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-50">
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button onClick={nextLightboxImage} className="absolute right-4 sm:right-10 top-1/2 -translate-y-1/2 p-3 sm:p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-50">
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Image Container */}
          <div className="w-full max-w-5xl px-16 sm:px-32 flex items-center justify-center flex-1 min-h-0 py-10">
            {currentLboxItem.image_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={currentLboxItem.image_path} 
                alt={currentLboxItem.name} 
                className="max-h-full max-w-full object-contain drop-shadow-2xl rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500">
                <ImageIcon className="w-32 h-32 mb-4 opacity-50" />
                <p className="text-xl font-bold">No Image Available</p>
              </div>
            )}
          </div>

          {/* Floating Data Bar */}
          <div className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-3xl bg-slate-800/80 backdrop-blur-md border border-slate-700 p-5 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
            
            {/* Left: Name & Details */}
            <div className="text-center sm:text-left">
              <h2 className="text-xl sm:text-2xl font-black text-white leading-tight mb-1">{currentLboxItem.name}</h2>
              <div className="flex items-center justify-center sm:justify-start gap-3 text-sm">
                <span className="text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded">{currentLboxItem.sku}</span>
                <span className="text-slate-300 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5"/> Pack of {currentLboxItem.pack_size || 10}</span>
              </div>
            </div>

            {/* Right: Price & Stock */}
            <div className="flex items-center gap-6 shrink-0">
              <div className="flex gap-4 font-mono text-center bg-slate-900 px-4 py-2 rounded-xl border border-slate-700">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Actual</p>
                  <p className="text-lg font-semibold text-slate-300">{lbACT}</p>
                </div>
                <div className="w-px bg-slate-700"></div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Available</p>
                  <p className={`text-lg font-black ${lbAVL > 0 ? "text-green-400" : "text-red-400"}`}>{lbAVL}</p>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Unit Price</p>
                <p className="text-3xl font-black text-blue-400">₹{currentLboxItem.price.toLocaleString()}</p>
              </div>
            </div>

          </div>

          {/* Image Counter */}
          <div className="absolute top-6 left-6 text-white bg-white/10 px-4 py-1.5 rounded-full text-sm font-bold tracking-widest backdrop-blur-sm border border-white/5">
            {lightboxIndex + 1} / {filteredItems.length}
          </div>
        </div>
      )}

      {/* --- FILTER PANEL --- */}
      {isFilterOpen && <div className="fixed inset-0 bg-slate-900/40 z-40 backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl transform transition-transform duration-300 flex flex-col ${isFilterOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold flex items-center gap-2"><Filter className="h-5 w-5 text-blue-600" /> Filter & Sort</h2>
          <button onClick={() => setIsFilterOpen(false)}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <h3 className="font-bold text-xs uppercase text-blue-800 mb-3 tracking-wider">Total Stock Quantity</h3>
            <div className="flex gap-2">
              <select value={qtyOperator} onChange={(e) => setQtyOperator(e.target.value as "greater" | "less")} className="w-1/2 p-2 text-sm border border-slate-300 rounded-md outline-none focus:border-blue-500 bg-white">
                <option value="greater">&ge; Greater than</option>
                <option value="less">&le; Less than</option>
              </select>
              <input type="number" placeholder="e.g. 500" value={qtyValue} onChange={(e) => setQtyValue(e.target.value)} className="w-1/2 p-2 text-sm border border-slate-300 rounded-md outline-none focus:border-blue-500 bg-white" />
            </div>
            <p className="text-[10px] text-slate-500 mt-2 italic">Filters by the total actual stock across all locations.</p>
          </div>

          <div>
             <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Sort Alphabetically</h3>
             <div className="flex gap-2">
               <button onClick={() => setSortOrder("A-Z")} className={`flex-1 py-2 flex justify-center items-center gap-2 border rounded-md text-sm font-semibold transition-colors ${sortOrder === "A-Z" ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}><ArrowDownAZ className="w-4 h-4"/> A to Z</button>
               <button onClick={() => setSortOrder("Z-A")} className={`flex-1 py-2 flex justify-center items-center gap-2 border rounded-md text-sm font-semibold transition-colors ${sortOrder === "Z-A" ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}><ArrowUpZA className="w-4 h-4"/> Z to A</button>
             </div>
          </div>

          <div>
            <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Stock Locations</h3>
            <div className="space-y-3">
              {locations.map(loc => (
                <label key={loc.id} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={selectedLocations.includes(loc.id)} onChange={(e) => setSelectedLocations(e.target.checked ? [...selectedLocations, loc.id] : selectedLocations.filter(id => id !== loc.id))} className="h-4.5 w-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                  <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{loc.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Main Categories</h3>
            <div className="space-y-3">
              {taxonomy.map(c => (
                <label key={c.id} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={selectedCats.includes(c.id)} onChange={(e) => setSelectedCats(e.target.checked ? [...selectedCats, c.id] : selectedCats.filter(id => id !== c.id))} className="h-4.5 w-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                  <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          {availableSubCats.length > 0 && (
            <div>
              <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Sub-Categories</h3>
              <div className="space-y-3 border-l-2 border-slate-100 pl-3">
                {availableSubCats.map(sc => (
                  <label key={sc.id} className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={selectedSubCats.includes(sc.id)} onChange={(e) => setSelectedSubCats(e.target.checked ? [...selectedSubCats, sc.id] : selectedSubCats.filter(id => id !== sc.id))} className="h-4.5 w-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                    <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{sc.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {availableSubSubCats.length > 0 && (
            <div>
              <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Variants / Sizes</h3>
              <div className="space-y-3 border-l-2 border-slate-100 pl-3 ml-3">
                {availableSubSubCats.map(ssc => (
                  <label key={ssc.id} className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={selectedSubSubCats.includes(ssc.id)} onChange={(e) => setSelectedSubSubCats(e.target.checked ? [...selectedSubSubCats, ssc.id] : selectedSubSubCats.filter(id => id !== ssc.id))} className="h-4.5 w-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
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
  );
}