"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/context/AuthContext"
import { Shield, Plus, Save, Loader2, Key, AlertTriangle, Users, User } from "lucide-react"

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

export default function RolesAndUsersPage() {
  const supabase = createClient()
  const { hasPermission, isLoading: authLoading } = useAuth()

  // ── UI States ──
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // ── Roles States ──
  const [roles, setRoles] = useState<any[]>([])
  const [selectedRole, setSelectedRole] = useState<any>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [newRoleName, setNewRoleName] = useState("")

  // ── Users States ──
  const [users, setUsers] = useState<any[]>([])

  const staticPermissions = Object.entries(PERMISSION_KEYS).map(([key, label]) => ({ key, label }))

  useEffect(() => {
    async function fetchData() {
      const [rolesRes, usersRes] = await Promise.all([
        supabase.from('roles').select('*').order('name'),
        supabase.from('profiles').select('*').order('full_name') // Using profiles table
      ])

      if (rolesRes.data) {
        setRoles(rolesRes.data)
        if (rolesRes.data.length > 0) {
          setSelectedRole(rolesRes.data[0])
          setPermissions(rolesRes.data[0].permissions || {})
        }
      }

      if (usersRes.data) setUsers(usersRes.data)

      setIsLoading(false)
    }
    
    if (authLoading) return;

    if (hasPermission('manage_roles')) fetchData();
    else setIsLoading(false);
  }, [supabase, authLoading, hasPermission])

  // ── SECURITY CHECK ──
  if (authLoading || isLoading) return <div className="p-20 text-center font-bold text-slate-500 flex justify-center items-center gap-2"><Loader2 className="w-5 h-5 animate-spin"/> Loading Vault...</div>;
  
  if (!hasPermission('manage_roles')) {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-8 bg-red-50 border border-red-200 rounded-2xl text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-red-800">Access Denied</h2>
        <p className="text-red-600 mt-2 font-medium">You do not have the required security clearance to view or modify roles and users.</p>
      </div>
    )
  }

  // ── ROLES LOGIC ──
  const handleSelectRole = (role: any) => {
    setSelectedRole(role)
    setPermissions(role.permissions || {})
  }

  const togglePermission = (key: string) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setIsSaving(true)

    const { error } = await supabase.from('roles').update({ permissions: permissions }).eq('id', selectedRole.id)

    if (error) alert("Failed to update role: " + error.message)
    else {
      setRoles(roles.map(r => r.id === selectedRole.id ? { ...r, permissions } : r))
      alert(`Permissions for ${selectedRole.name} have been securely updated!`)
    }
    setIsSaving(false)
  }

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleName.trim()) return;

    const { data, error } = await supabase.from('roles').insert([{ name: newRoleName.trim(), description: 'Custom Role', permissions: {} }]).select().single()

    if (error) alert("Error creating role: " + error.message)
    else if (data) {
      setRoles([...roles, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewRoleName("")
      handleSelectRole(data)
    }
  }

  // ── USERS LOGIC ──
  const handleRoleChange = async (userId: string, newRoleId: string) => {
    // 1. Optimistic UI update for speed
    setUsers(users.map(u => u.id === userId ? { ...u, role_id: newRoleId } : u))
    
    // 2. Direct DB update using the standard client (Works because of RLS)
    const { error } = await supabase.from('profiles').update({ role_id: newRoleId }).eq('id', userId)
    
    if (error) alert("Failed to update user role: " + error.message)
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-20">
      
      {/* ── HEADER & TABS ── */}
      <div className="bg-slate-900 rounded-2xl p-8 text-white shadow-xl flex flex-col gap-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3"><Shield className="w-8 h-8 text-blue-400"/> Roles & Users</h1>
            <p className="text-slate-400 mt-2 font-medium">Control features and manage team access.</p>
          </div>
          
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 w-full md:w-auto">
            <button onClick={() => setActiveTab('roles')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'roles' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Manage Roles</button>
            <button onClick={() => setActiveTab('users')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Manage Users</button>
          </div>
        </div>
      </div>

      {/* ── TAB CONTENT: ROLES ── */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Available Roles</h3>
            
            <form onSubmit={handleCreateRole} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm mb-2 focus-within:border-blue-400">
              <input 
                type="text" 
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="New Role Name..." 
                className="bg-transparent text-slate-800 outline-none px-2 w-full text-sm font-bold placeholder:text-slate-400 placeholder:font-medium"
                required
              />
              <button type="submit" className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors"><Plus className="w-4 h-4"/></button>
            </form>

            {roles.map(role => (
              <button
                key={role.id}
                onClick={() => handleSelectRole(role)}
                className={`text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${selectedRole?.id === role.id ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
              >
                <div className={`p-2 rounded-lg ${selectedRole?.id === role.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className={`font-black ${selectedRole?.id === role.id ? 'text-blue-900' : 'text-slate-700'}`}>{role.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                    {Object.values(role.permissions || {}).filter(val => val === true).length} Features
                  </p>
                </div>
              </button>
            ))}
          </div>

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
      )}

      {/* ── TAB CONTENT: USERS ── */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-blue-600"/> Team Members</h2>
              <p className="text-sm text-slate-500 font-medium mt-1">Assign roles to your staff.</p>
            </div>
            {/* The "Add User" button has been entirely removed */}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <tr>
                  <th className="p-5">Name</th>
                  <th className="p-5">Email</th>
                  <th className="p-5">Assigned Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 ? (
                  <tr><td colSpan={3} className="p-12 text-center text-slate-400">No users found in the system.</td></tr>
                ) : (
                  users.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="p-5 font-bold text-slate-800 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black">
                          {user.full_name ? user.full_name.charAt(0).toUpperCase() : <User className="w-4 h-4"/>}
                        </div>
                        {user.full_name || 'Unnamed User'}
                      </td>
                      <td className="p-5 text-slate-600">{user.email}</td>
                      <td className="p-5">
                        <select 
                          value={user.role_id || ""} 
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="bg-slate-100 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all cursor-pointer"
                        >
                          <option value="" disabled>Select a role...</option>
                          {roles.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}