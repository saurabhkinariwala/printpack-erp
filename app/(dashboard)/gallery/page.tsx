"use client"

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Filter, X, ArrowDownAZ, ArrowUpZA, Layers } from "lucide-react";

type Stock = { quantity: number; locations: { id: string; name: string } };
type Item = {
  id: string; name: string; sku: string; price: number; pack_size: number;
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
  
  // NEW: Dynamic Quantity Filter State
  const [qtyOperator, setQtyOperator] = useState<"greater" | "less">("greater");
  const [qtyValue, setQtyValue] = useState<string>("");

  const [appliedFilters, setAppliedFilters] = useState({ 
    cats: [] as string[], subs: [] as string[], subSubs: [] as string[], locs: [] as string[],
    qtyOp: "greater" as "greater" | "less", qtyVal: ""
  });

  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      // Fetch Items with new pack_size column
      const { data: itemsData } = await supabase.from('items').select(`
        id, name, sku, price, pack_size,
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

      // Fetch pending orders for accurate available stock calculation
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
    fetchData();
  }, [supabase]);

  // --- FILTER & SORT LOGIC ---
  const handleApplyFilters = () => {
    setAppliedFilters({ 
      cats: selectedCats, subs: selectedSubCats, subSubs: selectedSubSubCats, locs: selectedLocations,
      qtyOp: qtyOperator, qtyVal: qtyValue
    });
    setIsFilterOpen(false);
  };

  const handleClearFilters = () => {
    setSelectedCats([]); setSelectedSubCats([]); setSelectedSubSubCats([]); setSelectedLocations([]);
    setQtyOperator("greater"); setQtyValue("");
    setAppliedFilters({ cats: [], subs: [], subSubs: [], locs: [], qtyOp: "greater", qtyVal: "" });
    setSortOrder("A-Z");
    setIsFilterOpen(false);
  };

  let filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase());
    const catId = item.sub_categories?.categories?.id;
    const subCatId = item.sub_categories?.id;
    const subSubCatId = item.sub_sub_categories?.id;

    const matchesCat = appliedFilters.cats.length === 0 || (catId && appliedFilters.cats.includes(catId));
    const matchesSub = appliedFilters.subs.length === 0 || (subCatId && appliedFilters.subs.includes(subCatId));
    const matchesSubSub = appliedFilters.subSubs.length === 0 || (subSubCatId && appliedFilters.subSubs.includes(subSubCatId));
    
    const matchesLoc = appliedFilters.locs.length === 0 || 
      (item.stock && item.stock.some(s => appliedFilters.locs.includes(s.locations.id) && s.quantity > 0));

    // NEW: Quantity Filter Logic
    let matchesQty = true;
    if (appliedFilters.qtyVal !== "") {
      const totalActualStock = item.stock?.reduce((sum, s) => sum + s.quantity, 0) || 0;
      const compareValue = Number(appliedFilters.qtyVal);
      if (appliedFilters.qtyOp === "greater") {
        matchesQty = totalActualStock >= compareValue;
      } else {
        matchesQty = totalActualStock <= compareValue;
      }
    }

    return matchesSearch && matchesCat && matchesSub && matchesSubSub && matchesLoc && matchesQty;
  });

  filteredItems.sort((a, b) => 
    sortOrder === "A-Z" 
      ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) 
      : b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  const groupedItems = filteredItems.reduce((acc, item) => {
    const subCatName = item.sub_categories?.name || "Uncategorized";
    const subSubCatName = item.sub_sub_categories?.name || "Standard"; 

    if (!acc[subCatName]) acc[subCatName] = {};
    if (!acc[subCatName][subSubCatName]) acc[subCatName][subSubCatName] = [];
    
    acc[subCatName][subSubCatName].push(item);
    return acc;
  }, {} as Record<string, Record<string, Item[]>>);

  const availableSubCats = taxonomy
    .filter(c => selectedCats.length === 0 || selectedCats.includes(c.id))
    .flatMap(c => c.sub_categories || []);

  const availableSubSubCats = availableSubCats
    .filter(sc => selectedSubCats.length === 0 || selectedSubCats.includes(sc.id))
    .flatMap(sc => sc.sub_sub_categories || []);

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
            <input 
              type="text" placeholder="Search by product name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} 
              className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 w-full shadow-sm" 
            />
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {items.map((product) => (
                        <div key={product.id} className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden flex flex-col hover:shadow-md hover:border-blue-300 transition-all">
                          <div className="p-4 flex-1">
                            <h4 className="font-bold text-slate-800 leading-tight mb-1">{product.name}</h4>
                            
                            {/* SKU & Pack Size Block */}
                            <div className="flex items-center gap-2 mb-4">
                              <p className="text-xs text-slate-400 font-mono">{product.sku}</p>
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                <Layers className="w-3 h-3"/> Pack of: {product.pack_size || 10}
                              </span>
                            </div>
                            
                            <div className="bg-white border border-slate-100 rounded-md overflow-hidden">
                              <div className="bg-slate-100 px-3 py-1.5 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                <span>Location</span>
                                <div className="flex gap-4">
                                  <span className="w-10 text-right">Actual</span>
                                  <span className="w-10 text-right text-blue-600">Avail</span>
                                </div>
                              </div>
                              <div className="divide-y divide-slate-50">
                                {(!product.stock || product.stock.length === 0) ? (
                                  <div className="px-3 py-2 text-xs text-red-500 font-semibold text-center">Out of Stock</div>
                                ) : (
                                  (() => {
                                    let remainingPending = pendingQtys[product.id] || 0;
                                    return product.stock.map(s => {
                                      const locActual = s.quantity;
                                      const locDeduction = Math.min(locActual, remainingPending);
                                      remainingPending -= locDeduction;
                                      const realAvailable = locActual - locDeduction;

                                      return (
                                        <div key={s.locations.id} className="px-3 py-2 flex justify-between items-center text-xs">
                                          <span className="font-medium text-slate-700 truncate pr-2">{s.locations.name}</span>
                                          <div className="flex gap-4 font-mono">
                                            <span className="w-10 text-right text-slate-600">{locActual}</span>
                                            <span className={`w-10 text-right font-bold ${realAvailable > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                              {realAvailable}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    });
                                  })()
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="bg-white border-t border-slate-200 p-3 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Price</span>
                            <span className="font-black text-lg text-slate-800">₹{product.price.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- FILTER PANEL --- */}
      {isFilterOpen && <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl transform transition-transform duration-300 flex flex-col ${isFilterOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold flex items-center gap-2"><Filter className="h-5 w-5 text-blue-600" /> Filter & Sort</h2>
          <button onClick={() => setIsFilterOpen(false)}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Dynamic Quantity Filter */}
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <h3 className="font-bold text-xs uppercase text-blue-800 mb-3 tracking-wider">Total Stock Quantity</h3>
            <div className="flex gap-2">
              <select 
                value={qtyOperator} 
                onChange={(e) => setQtyOperator(e.target.value as "greater" | "less")}
                className="w-1/2 p-2 text-sm border border-slate-300 rounded-md outline-none focus:border-blue-500 bg-white"
              >
                <option value="greater">&ge; Greater than</option>
                <option value="less">&le; Less than</option>
              </select>
              <input 
                type="number" 
                placeholder="e.g. 500" 
                value={qtyValue} 
                onChange={(e) => setQtyValue(e.target.value)}
                className="w-1/2 p-2 text-sm border border-slate-300 rounded-md outline-none focus:border-blue-500 bg-white"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-2 italic">Filters by the total actual stock across all locations.</p>
          </div>

          <div>
             <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Sort Alphabetically</h3>
             <div className="flex gap-2">
               <button onClick={() => setSortOrder("A-Z")} className={`flex-1 py-2 flex justify-center items-center gap-2 border rounded-md text-sm font-semibold transition-colors ${sortOrder === "A-Z" ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                 <ArrowDownAZ className="w-4 h-4"/> A to Z
               </button>
               <button onClick={() => setSortOrder("Z-A")} className={`flex-1 py-2 flex justify-center items-center gap-2 border rounded-md text-sm font-semibold transition-colors ${sortOrder === "Z-A" ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                 <ArrowUpZA className="w-4 h-4"/> Z to A
               </button>
             </div>
          </div>

          <div>
            <h3 className="font-bold text-xs uppercase text-slate-500 mb-3 tracking-wider">Stock Locations</h3>
            <div className="space-y-3">
              {locations.map(loc => (
                <label key={loc.id} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={selectedLocations.includes(loc.id)} onChange={(e) => {
                    setSelectedLocations(e.target.checked ? [...selectedLocations, loc.id] : selectedLocations.filter(id => id !== loc.id))
                  }} className="h-4.5 w-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
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
                  <input type="checkbox" checked={selectedCats.includes(c.id)} onChange={(e) => {
                    setSelectedCats(e.target.checked ? [...selectedCats, c.id] : selectedCats.filter(id => id !== c.id))
                  }} className="h-4.5 w-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
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
                    <input type="checkbox" checked={selectedSubCats.includes(sc.id)} onChange={(e) => {
                      setSelectedSubCats(e.target.checked ? [...selectedSubCats, sc.id] : selectedSubCats.filter(id => id !== sc.id))
                    }} className="h-4.5 w-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
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
                    <input type="checkbox" checked={selectedSubSubCats.includes(ssc.id)} onChange={(e) => {
                      setSelectedSubSubCats(e.target.checked ? [...selectedSubSubCats, ssc.id] : selectedSubSubCats.filter(id => id !== ssc.id))
                    }} className="h-4.5 w-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
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