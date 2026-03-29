"use client"

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, Package, ShoppingCart, Users, ArrowRightLeft,
  Menu, X, Box, ChevronDown, ChevronRight,
  FolderOpen, Loader2, ImageIcon, Tag, CreditCard, Truck, Bell
} from "lucide-react";
import LogoutButton from "@/components/ui/LogoutButton"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { usePermissions } from "@/hooks/usePermissions"

type SubSubCategory = { id: string; name: string };
type SubCategory = { id: string; name: string; sub_sub_categories: SubSubCategory[] };
type Category = { id: string; name: string; sub_categories: SubCategory[] };

// ─── Header User Badge (NOW AN INTERACTIVE DROPDOWN) ─────────────────────────
function HeaderUserBadge() {
  const { profile, user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex items-center gap-3 text-left focus:outline-none p-1 rounded-lg hover:bg-slate-50 transition-colors"
      >
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-sm font-bold text-slate-700 leading-tight">{displayName}</span>
          {profile?.roles?.name && (
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{profile.roles.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-black shadow-md shadow-blue-500/20 border-2 border-white shrink-0">
            {initials}
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* The Dropdown Menu */}
      {isOpen && (
        <>
          {/* Invisible overlay to close dropdown when clicking outside */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 overflow-hidden transform origin-top-right transition-all">
            {/* Mobile-only user info inside dropdown */}
            <div className="px-4 py-3 border-b border-slate-100 sm:hidden bg-slate-50">
              <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{profile?.roles?.name || 'User'}</p>
            </div>
            
            <div className="px-3 py-2 flex flex-col gap-1">
              {/* Wrapping LogoutButton to ensure it fits the dropdown styling */}
              <div className="w-full text-left rounded-lg hover:bg-red-50 transition-colors group">
                <LogoutButton />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Inner Layout ─────────────────────────────────────────────────────────────
function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({ Products: true });
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const { canViewDashboard, isCategoryAllowed } = usePermissions()

  // Redirect employees away from /dashboard — their landing page is /orders
  useEffect(() => {
    if (pathname === "/dashboard" && !canViewDashboard) {
      router.replace("/orders")
    }
  }, [pathname, canViewDashboard, router])

  useEffect(() => {
    async function fetchTaxonomy() {
      const { data, error } = await supabase
        .from("categories")
        .select(`id, name, sub_categories ( id, name, sub_sub_categories ( id, name ) )`)
        .order("name");
      if (!error && data) setDbCategories(data as Category[]);
      setIsLoading(false);
    }
    fetchTaxonomy();
  }, [supabase]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const visibleCategories = dbCategories.filter(category =>
    isCategoryAllowed(category.name)
  )

  // Dashboard only shown if user has view_dashboard permission
  const topNavItems = [
    ...(canViewDashboard ? [{ name: "Dashboard",        href: "/dashboard", icon: LayoutDashboard }] : []),
    { name: "Orders",           href: "/orders",    icon: ShoppingCart    },
    { name: "Dispatch Register",href: "/dispatch",  icon: Truck           },
    { name: "Payments",         href: "/payments",  icon: CreditCard      },
    { name: "Customers",        href: "/customers", icon: Users           },
    { name: "Inventory",        href: "/inventory", icon: Package         },
    { name: "Stock Transfers",  href: "/transfers", icon: ArrowRightLeft  },
    { name: "Product Gallery",  href: "/gallery",   icon: ImageIcon       },
  ]

  const isProductsActive = pathname.includes("/products");

  return (
    <div className="flex min-h-screen w-full bg-[#f4f6f9] print:bg-white">
      {isSidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 sm:hidden print:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`print:hidden fixed inset-y-0 left-0 z-30 w-64 flex-col bg-[#1e232d] text-slate-300 transition-transform duration-300 ease-in-out sm:translate-x-0 sm:static sm:flex ${isSidebarOpen ? "translate-x-0 flex" : "-translate-x-full hidden"}`}>

        <div className="flex h-16 items-center justify-between px-5 text-white border-b border-white/10 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 shadow-md shadow-blue-500/30">
              <span className="font-black text-white text-sm">{process.env.NEXT_PUBLIC_COMPANY_SHORT_NAME || "ERP"}</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-white font-black text-sm">{process.env.NEXT_PUBLIC_COMPANY_NAME || "ERP Prime"}</span>
              <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest">ERP Prime</span>
            </div>
          </Link>
          <button className="sm:hidden p-1 rounded hover:bg-white/10" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-4 w-4 text-slate-400 hover:text-white" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 mb-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Main Menu</p>
          <ul className="space-y-0.5 text-sm font-medium">
            {topNavItems.map((item) => {
              const isActive = item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={() => setIsSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all text-[13px] ${
                      isActive
                        ? "bg-blue-600 text-white shadow-sm shadow-blue-600/40"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.name}
                  </Link>
                </li>
              );
            })}

            {/* Dynamic Products — filtered by permission */}
            <li className="flex flex-col mt-3 pt-3 border-t border-white/5">
              <p className="px-3 mb-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Products</p>
              <button
                onClick={() => toggleMenu("Products")}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] transition-all ${
                  isProductsActive ? "text-blue-400" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3"><Box className="h-4 w-4" /> Catalog</div>
                {expandedMenus["Products"] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>

              {expandedMenus["Products"] && (
                <ul className="mt-1 space-y-0.5 pl-3 pr-1">
                  {isLoading ? (
                    <li className="flex items-center gap-2 text-slate-600 px-3 py-2 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </li>
                  ) : visibleCategories.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-slate-600 italic">No categories available</li>
                  ) : (
                    visibleCategories.map((category) => {
                      const isExpanded = expandedMenus[category.id];
                      return (
                        <li key={category.id} className="flex flex-col">
                          <button
                            onClick={() => toggleMenu(category.id)}
                            className="flex items-center justify-between rounded-lg px-3 py-2 text-[12px] text-slate-500 hover:text-white hover:bg-white/5 transition-all"
                          >
                            <div className="flex items-center gap-2">
                              <FolderOpen className="h-3.5 w-3.5" />{category.name}
                            </div>
                            {category.sub_categories?.length > 0 && (
                              isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                            )}
                          </button>

                          {isExpanded && category.sub_categories?.length > 0 && (
                            <ul className="mt-0.5 space-y-0.5 pl-5 border-l border-white/5 ml-3">
                              {category.sub_categories.map((sub) => {
                                const isSubExpanded = expandedMenus[sub.id];
                                const hasSubSubs = sub.sub_sub_categories?.length > 0;
                                return (
                                  <li key={sub.id} className="flex flex-col">
                                    <div className="flex items-center justify-between rounded-lg hover:bg-white/5">
                                      <Link
                                        href={`/products/${sub.id}`}
                                        onClick={() => { setIsSidebarOpen(false); if (hasSubSubs && !isSubExpanded) toggleMenu(sub.id); }}
                                        className={`flex-1 px-2 py-1.5 text-[11px] ${pathname === `/products/${sub.id}` ? "text-blue-400 font-bold" : "text-slate-500 hover:text-white"}`}
                                      >
                                        {sub.name}
                                      </Link>
                                      {hasSubSubs && (
                                        <button onClick={() => toggleMenu(sub.id)} className="p-1.5 text-slate-600 hover:text-white">
                                          {isSubExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                        </button>
                                      )}
                                    </div>
                                    {isSubExpanded && hasSubSubs && (
                                      <ul className="mt-0.5 space-y-0.5 pl-3 border-l border-white/5 ml-2">
                                        {sub.sub_sub_categories.map((subSub) => (
                                          <li key={subSub.id}>
                                            <Link
                                              href={`/products/${subSub.id}`}
                                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] ${pathname === `/products/${subSub.id}` ? "text-blue-400 font-bold" : "text-slate-600 hover:text-slate-300"}`}
                                            >
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
      </aside>

      {/* ── Main Content ── */}
      <main className="flex w-full flex-col sm:min-w-0 overflow-hidden print:overflow-visible">
        <header className="print:hidden flex h-16 items-center justify-between bg-white px-4 sm:px-6 shadow-sm border-b border-slate-100 shrink-0 z-10">
          <button className="sm:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden sm:block">
            <BreadcrumbTitle pathname={pathname} />
          </div>
          <div className="flex items-center gap-3 ml-auto sm:ml-0">
            <button className="relative p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <Bell className="h-5 w-5" />
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <HeaderUserBadge />
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6 overflow-auto print:p-0 print:overflow-visible">{children}</div>
      </main>
    </div>
  );
}

// ─── Breadcrumb Title ─────────────────────────────────────────────────────────
function BreadcrumbTitle({ pathname }: { pathname: string }) {
  const routeNames: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/orders":    "Orders",
    "/dispatch":  "Dispatch Register",
    "/payments":  "Payments",
    "/customers": "Customer Ledger",
    "/inventory": "Inventory",
    "/transfers": "Stock Transfers",
    "/gallery":   "Product Gallery",
  }
  const matched = Object.entries(routeNames).find(([href]) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href)
  )
  if (!matched) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-400 font-medium">PrintPack ERP</span>
      <span className="text-slate-300">/</span>
      <span className="font-bold text-slate-700">{matched[1]}</span>
    </div>
  )
}

// ─── Root Export ──────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </AuthProvider>
  )
}