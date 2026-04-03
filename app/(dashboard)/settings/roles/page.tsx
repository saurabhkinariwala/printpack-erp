"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/context/AuthContext"
import { Shield, Plus, Save, Loader2, Key, AlertTriangle, Users } from "lucide-react"

// Import the permission keys from usePermissions
const PERMISSION_KEYS = {
  view_dashboard: "View Dashboard",
  access_bakery: "Access Bakery Products",
  access_giftbox: "Access Gift Box Products",
  edit_products: "Edit Products",
  edit_orders: "Edit Orders",
  delete_orders: "Delete Orders",
  edit_cash_memos: "Edit Cash Memos",
  delete_cash_memos: "Delete Cash Memos",
  edit_dispatch: "Edit Dispatch",
  manage_roles: "Manage Roles",
} as const

export default function RolesManagementPage() {
  const supabase = createClient()
  const { hasPermission, isLoading: authLoading } = useAuth()

  const [roles, setRoles] = useState<any[]>([])
  const [selectedRole, setSelectedRole] = useState<any>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  
  // Use static permissions from the KEYS object
  const staticPermissions = Object.entries(PERMISSION_KEYS).map(([key, label]) => ({
    key,
    label
  }))
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")

useEffect(() => {
    async function fetchRoles() {
      const { data, error } = await supabase.from('roles').select('*').order('name')
      if (data) {
        setRoles(data)
        
        if (data.length > 0) {
          setSelectedRole(data[0])
          setPermissions(data[0].permissions || {})
        }
      }
      setIsLoading(false) // Turn off loading after fetch
    }
    
    if (authLoading) return; // Wait for auth to finish checking

    if (hasPermission('manage_roles')) {
      fetchRoles()
    } else {
      setIsLoading(false) // Kick out of loading to show the Access Denied screen!
    }
  }, [supabase, authLoading, hasPermission])

  // --- SECURITY CHECK ---
  if (authLoading || isLoading) return <div className="p-20 text-center font-bold text-slate-500 flex justify-center items-center gap-2"><Loader2 className="w-5 h-5 animate-spin"/> Loading Vault...</div>;
  
  if (!hasPermission('manage_roles')) {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-8 bg-red-50 border border-red-200 rounded-2xl text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-red-800">Access Denied</h2>
        <p className="text-red-600 mt-2 font-medium">You do not have the required security clearance to view or modify role permissions.</p>
      </div>
    )
  }

  // --- LOGIC: Handle Clicking a Role ---
  const handleSelectRole = (role: any) => {
    setSelectedRole(role)
    setPermissions(role.permissions || {})
  }

  // --- LOGIC: Handle Flipping a Switch ---
  const togglePermission = (key: string) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key] // Flip true to false, or false to true
    }))
  }

  // --- LOGIC: Save the JSON back to the Database ---
  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setIsSaving(true)

    const { error } = await supabase
      .from('roles')
      .update({ permissions: permissions })
      .eq('id', selectedRole.id)

    if (error) {
      alert("Failed to update role: " + error.message)
    } else {
      setRoles(roles.map(r => r.id === selectedRole.id ? { ...r, permissions } : r))
      alert(`Permissions for ${selectedRole.name} have been securely updated!`)
    }
    
    setIsSaving(false)
  }

  // --- LOGIC: Create a Brand New Role ---
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleName.trim()) return;

    const { data, error } = await supabase
      .from('roles')
      .insert([{ name: newRoleName.trim(), description: 'Custom Role', permissions: {} }])
      .select()
      .single()

    if (error) {
      alert("Error creating role: " + error.message)
    } else if (data) {
      setRoles([...roles, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewRoleName("")
      handleSelectRole(data)
    }
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-20">
      
      {/* HEADER */}
      <div className="bg-slate-900 rounded-2xl p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3"><Shield className="w-8 h-8 text-blue-400"/> Security & Roles</h1>
          <p className="text-slate-400 mt-2 font-medium">Control exactly what features your employees can see and edit.</p>
        </div>
        
        {/* ADD NEW ROLE FORM */}
        <form onSubmit={handleCreateRole} className="flex items-center gap-2 bg-slate-800 p-2 rounded-xl border border-slate-700 w-full md:w-auto">
          <input 
            type="text" 
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="e.g. Sales Manager" 
            className="bg-transparent text-white outline-none px-3 py-2 w-full md:w-48 placeholder:text-slate-500 font-bold"
            required
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-colors"><Plus className="w-5 h-5"/></button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* LEFT COLUMN: Role List */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Available Roles</h3>
          {roles.map(role => (
            <button
              key={role.id}
              onClick={() => handleSelectRole(role)}
              className={`text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${selectedRole?.id === role.id ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
            >
              <div className={`p-2 rounded-lg ${selectedRole?.id === role.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className={`font-black ${selectedRole?.id === role.id ? 'text-blue-900' : 'text-slate-700'}`}>{role.name}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                  {Object.values(role.permissions || {}).filter(val => val === true).length} Toggles Active
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* RIGHT COLUMN: Toggles Configuration */}
        {selectedRole && (
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Key className="w-5 h-5 text-blue-600"/> Configuring: {selectedRole.name}</h2>
                  <p className="text-sm text-slate-500 font-medium mt-1">Changes made here apply instantly next time the user logs in.</p>
                </div>
                
                <button 
                  onClick={handleSavePermissions} 
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-md font-black flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} Save Permissions
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {staticPermissions.map((feature) => {
                  const isEnabled = !!permissions[feature.key];
                  
                  return (
                    <div 
                      key={feature.key} 
                      onClick={() => togglePermission(feature.key)}
                      className={`flex items-start justify-between gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${isEnabled ? 'border-green-500 bg-green-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div>
                        <h4 className={`font-black text-sm ${isEnabled ? 'text-green-900' : 'text-slate-700'}`}>{feature.label}</h4>
                        <p className={`text-[10px] font-mono mt-1 ${isEnabled ? 'text-green-700/80' : 'text-slate-400'}`}>{feature.key}</p>
                      </div>
                      
                      <div className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-300 ease-in-out ${isEnabled ? 'bg-green-500' : 'bg-slate-300'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ease-in-out ${isEnabled ? 'translate-x-7' : 'translate-x-1'}`}></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}