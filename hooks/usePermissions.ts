"use client"

import { useAuth } from "@/context/AuthContext"

// ─────────────────────────────────────────────────────────────────────────────
// MASTER PERMISSIONS HOOK
// ─────────────────────────────────────────────────────────────────────────────
// Reads from AuthContext — which already loaded roles.permissions from Supabase
// at login. No extra API call needed. The flow is:
//   Login → AuthContext fetches profiles + roles(permissions) once → stored in
//   memory → this hook reads it via hasPermission() on every render.
//
// HOW TO ADD A NEW PERMISSION:
//   1. Add the toggle in your Roles UI (updates the DB automatically)
//   2. Add one line to KEYS below, matching the exact DB key string
//   3. Add one `const can___` line in the hook body
//   4. Add it to the return object
//   TypeScript will catch every usage site automatically.
// ─────────────────────────────────────────────────────────────────────────────

// ── Raw keys — must match roles.permissions JSONB keys exactly ───────────────
const KEYS = {
  viewDashboard: "view_dashboard",   // Controls dashboard nav + page access
  accessBakery:  "access_bakery",    // Bakery products in catalog, sidebar, inventory
  accessGiftbox: "access_giftbox",   // Gift Box products in catalog, sidebar, inventory
  editProducts:  "edit_products",    // Can edit items in the products pages
  editOrders:    "edit_orders",      // Can edit existing orders
  deleteOrders:  "delete_orders",    // Can delete orders
  editDispatch:  "edit_dispatch",    // Can create/manage dispatch notes
  manageRoles:   "manage_roles",     // Super admin — can open the Roles settings page
} as const

// ── Category name → KEYS entry (drives isCategoryAllowed) ───────────────────
// Add one line here when you add a new restricted category.
const CATEGORY_PERMISSION_MAP: Record<string, keyof typeof KEYS> = {
  "bakery":      "accessBakery",
  "gift box":    "accessGiftbox",
  "gift boxes":  "accessGiftbox",
  "giftbox":     "accessGiftbox",
}

// ─────────────────────────────────────────────────────────────────────────────
export function usePermissions() {
  const { hasPermission } = useAuth()

  // ── Named boolean flags ───────────────────────────────────────────────────
  const canViewDashboard = hasPermission(KEYS.viewDashboard)
  const canAccessBakery  = hasPermission(KEYS.accessBakery)
  const canAccessGiftbox = hasPermission(KEYS.accessGiftbox)
  const canEditProducts  = hasPermission(KEYS.editProducts)
  const canEditOrders    = hasPermission(KEYS.editOrders)
  const canDeleteOrders  = hasPermission(KEYS.deleteOrders)
  const canEditDispatch  = hasPermission(KEYS.editDispatch)
  const canManageRoles   = hasPermission(KEYS.manageRoles)

  // ── Category filter — used by every page that loads items ────────────────
  const categoryPermCheck: Record<string, boolean> = {
    accessBakery:  canAccessBakery,
    accessGiftbox: canAccessGiftbox,
  }

  function isCategoryAllowed(categoryName: string | null | undefined): boolean {
    if (!categoryName) return true
    const permKey = CATEGORY_PERMISSION_MAP[categoryName.toLowerCase().trim()]
    if (!permKey) return true          // not in map → unrestricted
    return categoryPermCheck[permKey] ?? true
  }

  return {
    canViewDashboard,
    canAccessBakery,
    canAccessGiftbox,
    canEditProducts,
    canEditOrders,
    canDeleteOrders,
    canEditDispatch,
    canManageRoles,
    isCategoryAllowed,
  }
}