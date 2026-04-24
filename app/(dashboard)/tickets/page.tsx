"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/context/AuthContext"
import { Loader2, Ticket, CheckCircle2, Clock, User as UserIcon, ArrowRight, Hand, HelpCircle } from "lucide-react"

type HelpdeskTicket = {
  id: string;
  category: string;
  reference_text: string | null;
  title: string;
  status: string;
  created_at: string;
  raised_by: string;
  assigned_to: string | null;
  raised_user: { full_name: string } | null;
  assigned_user: { full_name: string } | null;
}

type TabType = 'Open' | 'In Progress' | 'Pending Info' | 'Resolved';

export default function SharedHelpdeskPage() {
  const supabase = createClient()
  const { user, profile } = useAuth()
  
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('Open')
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // Determine role
  const isSuperAdmin = profile?.roles?.name === 'Super Admin' || profile?.roles?.name === 'Admin'

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    setIsLoading(true)
    
    // 1. Build the base query
    let query = supabase
      .from('tickets')
      .select(`
        id, category, reference_text, title, status, created_at, raised_by, assigned_to,
        raised_user:profiles!tickets_raised_by_fkey (full_name),
        assigned_user:profiles!tickets_assigned_to_fkey (full_name)
      `)
      .order('created_at', { ascending: false })

    // 2. ⚡ THE FILTER: If not an admin, ONLY fetch their own tickets
    if (!isSuperAdmin) {
      query = query.eq('raised_by', user.id)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching tickets:", error)
    } else if (data) {
      setTickets(data as unknown as HelpdeskTicket[])
    }
    
    setIsLoading(false)
  }, [user, isSuperAdmin, supabase])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  // Admin Only: Claiming a ticket
  const handleClaimTicket = async (ticketId: string) => {
    if (!user || !isSuperAdmin) return;
    setProcessingId(ticketId)

    const { error } = await supabase
      .from('tickets')
      .update({ assigned_to: user.id, status: 'In Progress' })
      .eq('id', ticketId)

    if (error) {
      alert("Failed to claim ticket: " + error.message)
    } else {
      setTickets(tickets.map(t => 
        t.id === ticketId ? { ...t, assigned_to: user.id, status: 'In Progress', assigned_user: { full_name: profile?.full_name || 'You' } } : t
      ))
    }
    setProcessingId(null)
  }

 const filteredTickets = tickets.filter(t => t.status === activeTab)
  const countOpen = tickets.filter(t => t.status === 'Open').length
  const countProgress = tickets.filter(t => t.status === 'In Progress').length
  const countPending = tickets.filter(t => t.status === 'Pending Info').length
  const countResolved = tickets.filter(t => t.status === 'Resolved').length

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">
      
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Ticket className="w-6 h-6 text-blue-600"/> 
            {/* Dynamic Title based on role */}
            {isSuperAdmin ? "Global Helpdesk Queue" : "My Support Tickets"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isSuperAdmin ? "Manage, assign, and resolve employee correction requests." : "Track the status of your correction requests."}
          </p>
        </div>
        
        {/* Give employees a quick way to create a new ticket from this page */}
        {!isSuperAdmin && (
          <Link href="/tickets/new" className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm flex items-center gap-2">
             Raise New Ticket
          </Link>
        )}
      </div>

      {/* ── Dashboard Layout ── */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Side: Status Navigation (Tabs) */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
          <button onClick={() => setActiveTab('Open')} className={`flex items-center justify-between p-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'Open' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
            <span className="flex items-center gap-2"><Clock className="w-4 h-4"/> Open</span>
            {countOpen > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'Open' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>{countOpen}</span>}
          </button>
          
          <button onClick={() => setActiveTab('In Progress')} className={`flex items-center justify-between p-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'In Progress' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
            <span className="flex items-center gap-2"><UserIcon className="w-4 h-4"/> In Progress</span>
            {countProgress > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'In Progress' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>{countProgress}</span>}
          </button>
          
          <button onClick={() => setActiveTab('Pending Info')} className={`flex items-center justify-between p-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'Pending Info' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
            <span className="flex items-center gap-2"><HelpCircle className="w-4 h-4"/> Pending Info</span>
            {countPending > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'Pending Info' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-600'}`}>{countPending}</span>}
          </button>
          
          <div className="h-px bg-slate-200 my-2"></div>
          
          <button onClick={() => setActiveTab('Resolved')} className={`flex items-center justify-between p-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'Resolved' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:border-green-300 hover:bg-green-50'}`}>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Resolved</span>
            {countResolved > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'Resolved' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-600'}`}>{countResolved}</span>}
          </button>
        </div>

        {/* Right Side: Ticket List */}
        <div className="flex-1">
          {isLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-24 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-dashed p-24 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Ticket className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-700">No {activeTab} Tickets</h3>
              <p className="text-sm text-slate-500 mt-1">
                {isSuperAdmin ? "The queue is clear!" : "You don't have any tickets in this status."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                  <tr>
                    <th className="p-4 w-40">Ticket Details</th>
                    <th className="p-4">Issue</th>
                    <th className="p-4 w-40 text-center">Status / Assigned</th>
                    <th className="p-4 w-32 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map(ticket => (
                    <tr key={ticket.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{ticket.category}</div>
                        {ticket.reference_text && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded inline-flex">
                            {ticket.reference_text}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800 truncate max-w-sm">{ticket.title}</div>
                        <div className="text-[11px] text-slate-500 mt-1 font-medium flex items-center gap-1">
                          {/* Only show "Raised by" if the viewer is a Super Admin. Employees know they raised it! */}
                          {isSuperAdmin && (
                            <>Raised by <span className="font-bold text-slate-700">{ticket.raised_user?.full_name || 'Unknown User'}</span><span className="text-slate-300 mx-1">•</span></>
                          )}
                          {new Date(ticket.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {ticket.status === 'Open' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">
                            Unassigned
                          </span>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">
                              {ticket.status}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 mt-1.5 flex items-center gap-1">
                              <UserIcon className="w-3 h-3"/> {ticket.assigned_user?.full_name || 'Admin'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          
                          {/* ⚡ ONLY SUPER ADMINS can see the claim button */}
                          {isSuperAdmin && ticket.status === 'Open' && (
                            <button 
                              onClick={() => handleClaimTicket(ticket.id)}
                              disabled={processingId === ticket.id}
                              className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 rounded shadow-sm font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {processingId === ticket.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Hand className="w-4 h-4"/>} 
                              Claim
                            </button>
                          )}
                          
                          <Link href={`/tickets/${ticket.id}`} className="p-2 text-slate-600 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded shadow-sm font-bold text-xs flex items-center gap-1.5 transition-colors">
                            View <ArrowRight className="w-4 h-4"/>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
      </div>
    </div>
  )
}