"use client"

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, Package, ShoppingCart, Users, ArrowRightLeft,
  Search, Bell, Mail, Menu, X, Box, ChevronDown, ChevronRight,
  FolderOpen, Loader2, ImageIcon, Tag
} from "lucide-react";
import LogoutButton from "@/components/ui/LogoutButton"
import { AuthProvider } from "@/context/AuthContext"

type SubSubCategory = { id: string; name: string };
type SubCategory = { id: string; name: string; sub_sub_categories: SubSubCategory[] };
type Category = { id: string; name: string; sub_categories: SubCategory[] };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    Products: true, 
  });
  
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function fetchTaxonomy() {
      const { data, error } = await supabase
        .from('categories')
        .select(`
          id,
          name,
          sub_categories (
            id,
            name,
            sub_sub_categories (
              id,
              name
            )
          )
        `)
        .order('name');

      if (!error && data) {
        setDbCategories(data as Category[]);
      }
      setIsLoading(false);
    }
    fetchTaxonomy();
  }, [supabase]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const topNavItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Orders & Dispatch", href: "/orders", icon: ShoppingCart },
    { name: "Multi-Location Stock", href: "/inventory", icon: Package },
    { name: "Stock Transfers", href: "/transfers", icon: ArrowRightLeft },
    { name: "Customers", href: "/customers", icon: Users },
    { name: "Product Gallery", href: "/gallery", icon: ImageIcon },
  ];

  const isProductsActive = pathname.includes('/products');

  return (
    <AuthProvider>

    <div className="flex min-h-screen w-full bg-[#f4f6f9]">
      {isSidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 sm:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-30 w-64 flex-col bg-[#1e232d] text-slate-300 transition-transform duration-300 ease-in-out sm:translate-x-0 sm:static sm:flex ${isSidebarOpen ? "translate-x-0 flex" : "-translate-x-full hidden"}`}>
        <div className="flex h-16 items-center justify-between px-6 text-white border-b border-slate-700/50">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight text-xl">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#1e232d]"><span className="font-black text-lg">E</span></div>
            <span>ERP Prime</span>
          </Link>
          <button className="sm:hidden" onClick={() => setIsSidebarOpen(false)}><X className="h-5 w-5 text-slate-400 hover:text-white" /></button>
        </div>
        
        <div className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Personal</div>

        <nav className="flex-1 overflow-auto px-4 pb-4">
          <ul className="grid gap-1 text-sm font-medium">
            
            {topNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.name}>
                  <Link href={item.href} onClick={() => setIsSidebarOpen(false)} className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition-all ${isActive ? "bg-blue-600 text-white shadow-md" : "text-slate-300 hover:bg-[#282e3b] hover:text-white"}`}>
                    <item.icon className="h-4 w-4" />{item.name}
                  </Link>
                </li>
              );
            })}

            {/* Dynamic Products Sidebar */}
            <li className="flex flex-col mt-4 border-t border-slate-700/50 pt-4">
              <button onClick={() => toggleMenu("Products")} className={`flex items-center justify-between rounded-md px-3 py-2.5 transition-all ${isProductsActive && !expandedMenus["Products"] ? "text-blue-400" : "text-slate-300 hover:bg-[#282e3b]"}`}>
                <div className="flex items-center gap-3"><Box className="h-4 w-4" /> Products</div>
                {expandedMenus["Products"] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              
              {expandedMenus["Products"] && (
                <ul className="mt-1 flex flex-col gap-1 pl-4 pr-2">
                  {isLoading ? (
                    <li className="flex items-center gap-2 text-slate-500 px-3 py-2 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</li>
                  ) : (
                    dbCategories.map((category) => {
                      const isExpanded = expandedMenus[category.id];
                      return (
                        <li key={category.id} className="flex flex-col">
                          <button onClick={() => toggleMenu(category.id)} className="flex items-center justify-between rounded-md px-3 py-2 text-[13px] text-slate-400 hover:text-white hover:bg-[#282e3b]">
                            <div className="flex items-center gap-2"><FolderOpen className="h-3.5 w-3.5" />{category.name}</div>
                            {category.sub_categories?.length > 0 && (isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
                          </button>

                          {/* Level 2: Sub Categories */}
                          {isExpanded && category.sub_categories?.length > 0 && (
                            <ul className="mt-1 flex flex-col gap-1 pl-6 border-l border-slate-700/50 ml-3">
                              {category.sub_categories.map((sub) => {
                                const isSubExpanded = expandedMenus[sub.id];
                                const hasSubSubs = sub.sub_sub_categories?.length > 0;
                                
                                return (
                                  <li key={sub.id} className="flex flex-col">
                                    <div className="flex items-center justify-between rounded-md hover:bg-[#282e3b]">
                                      {/* Clicking the link now also expands the menu if it has children */}
                                      <Link 
                                        href={`/products/${sub.id}`} 
                                        onClick={() => { 
                                          setIsSidebarOpen(false); 
                                          if (hasSubSubs && !isSubExpanded) toggleMenu(sub.id); 
                                        }} 
                                        className={`flex-1 px-2 py-1.5 text-[12px] ${pathname === `/products/${sub.id}` ? "text-blue-400 font-semibold" : "text-slate-500 hover:text-white"}`}
                                      >
                                        {sub.name}
                                      </Link>
                                      {hasSubSubs && (
                                        <button onClick={() => toggleMenu(sub.id)} className="p-1.5 text-slate-500 hover:text-white">
                                          {isSubExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                        </button>
                                      )}
                                    </div>

                                    {/* Level 3: Sub-Sub Categories */}
                                    {isSubExpanded && hasSubSubs && (
                                      <ul className="mt-1 flex flex-col pl-4 border-l border-slate-700/50 ml-2">
                                        {sub.sub_sub_categories.map((subSub) => (
                                          <li key={subSub.id}>
                                            <Link href={`/products/${subSub.id}`} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${pathname === `/products/${subSub.id}` ? "text-blue-400 font-semibold" : "text-slate-600 hover:text-slate-300"}`}>
                                              <Tag className="h-2.5 w-2.5" /> {subSub.name}
                                            </Link>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </li>
          </ul>
        </nav>
        <div className="mt-auto border-t border-slate-200 p-4">
          <LogoutButton />
        </div>
      </aside>

      <main className="flex w-full flex-col sm:min-w-0">
        <header className="flex h-16 items-center justify-between bg-white px-4 sm:px-6 shadow-sm border-b border-slate-100">
          <button className="text-slate-500 sm:hidden" onClick={() => setIsSidebarOpen(true)}><Menu className="h-6 w-6" /></button>
          <div className="flex items-center gap-4 text-slate-500 ml-auto">
            <Search className="h-5 w-5 cursor-pointer hover:text-blue-600" />
            <div className="h-8 w-8 rounded-full bg-blue-100 border-2 border-blue-200 ml-2"></div>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
    </AuthProvider>
  );
}