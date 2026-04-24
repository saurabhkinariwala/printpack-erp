"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/context/AuthContext"
import { 
  ArrowLeft, Send, CheckCircle2, Clock, 
  User as UserIcon, ShieldCheck, Loader2, AlertCircle, Hash
} from "lucide-react"

// Types to match our Supabase schema
type TicketDetail = {
  id: string;
  category: string;
  reference_text: string | null;
  title: string;
  description: string;
  status: string;
  created_at: string;
  raised_by: string;
  assigned_to: string | null;
  raised_user: { full_name: string } | null;
  assigned_user: { full_name: string } | null;
}

type TicketMessage = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender: { full_name: string, role_id: string } | null;
}

export default function TicketDetailPage() {
  const { id } = useParams() // Grabs the ticket ID from the URL
  const router = useRouter()
  const supabase = createClient()
  const { user, profile } = useAuth()
  
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isSuperAdmin = profile?.roles?.name === 'Super Admin' || profile?.roles?.name === 'Admin'

  // Fetch the ticket and its chat history
  useEffect(() => {
    if (!user || !id) return;

    const fetchTicketData = async () => {
      setIsLoading(true)

      // 1. Fetch Ticket Info
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          raised_user:profiles!tickets_raised_by_fkey(full_name),
          assigned_user:profiles!tickets_assigned_to_fkey(full_name)
        `)
        .eq('id', id)
        .single()

      if (ticketError || !ticketData) {
        console.error("Ticket not found")
        setIsLoading(false)
        return
      }

      // ⚡ THE GATEKEEPER: If not an admin, ensure they own this ticket
      if (!isSuperAdmin && ticketData.raised_by !== user.id) {
        setAccessDenied(true)
        setIsLoading(false)
        return
      }

      setTicket(ticketData as unknown as TicketDetail)

      // 2. Fetch Chat Messages
      const { data: messageData } = await supabase
        .from('ticket_messages')
        .select(`
          *,
          sender:profiles!ticket_messages_sender_id_fkey(full_name, role_id)
        `)
        .eq('ticket_id', id)
        .order('created_at', { ascending: true })

      if (messageData) {
        setMessages(messageData as unknown as TicketMessage[])
      }

      setIsLoading(false)
    }

    fetchTicketData()

    // ⚡ REAL-TIME CHAT: Listen for new messages while on the page
    const channel = supabase.channel(`ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${id}` }, 
        async (payload) => {
          
          // ⚡ SMART CHECK: Don't do anything if we already optimistically added this message!
          setMessages(prev => {
            const alreadyExists = prev.some(msg => msg.id === payload.new.id);
            if (alreadyExists) return prev; // Skip it!
            
            // If it doesn't exist (e.g., the OTHER person sent it), fetch their name and add it
            supabase.from('profiles').select('full_name, role_id').eq('id', payload.new.sender_id).single().then(({ data: senderData }) => {
              const incomingMessage = { ...payload.new, sender: senderData } as TicketMessage;
              setMessages(current => [...current, incomingMessage]);
            });
            
            return prev; // Return current state while the async fetch happens
          });
        }
      ).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, user, isSuperAdmin, supabase])

  // Auto-scroll to the bottom of the chat when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user || !ticket) return

    setIsSending(true)

    // ⚡ 1. Insert AND Select the returned message so we can show it instantly
    const { data: insertedMsg, error: messageError } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        message: newMessage.trim()
      })
      .select('*, sender:profiles!ticket_messages_sender_id_fkey(full_name, role_id)')
      .single()

    if (!messageError && insertedMsg) {
      setNewMessage("") // Clear input

      // ⚡ 2. INSTANT UI UPDATE: Append the message to the chat immediately
      setMessages(prev => [...prev, insertedMsg as TicketMessage])

      // 3. Smart Status Update & Notifications
      let newStatus = ticket.status
      let notifyUserId = null
      let notificationTitle = ""

      if (isSuperAdmin) {
        newStatus = 'Pending Info'
        notifyUserId = ticket.raised_by
        notificationTitle = "Admin Replied to Ticket"
      } else {
        newStatus = 'In Progress'
        notifyUserId = ticket.assigned_to 
        notificationTitle = "Employee Updated Ticket"
      }

      if (newStatus !== ticket.status) {
        await supabase.from('tickets').update({ status: newStatus }).eq('id', ticket.id)
        
        // ⚡ 4. INSTANT UI UPDATE: Change the status badge immediately
        setTicket({ ...ticket, status: newStatus })
      }

      if (notifyUserId) {
        await supabase.from('notifications').insert({
          user_id: notifyUserId,
          title: notificationTitle,
          message: `New message on ticket: ${ticket.title}`,
          link: `/tickets/${ticket.id}`
        })
      }
    }

    setIsSending(false)
  }

  const handleResolveTicket = async () => {
    if (!ticket || !isSuperAdmin) return
    setIsResolving(true)

    const { error } = await supabase
      .from('tickets')
      .update({ status: 'Resolved' })
      .eq('id', ticket.id)

    if (!error) {
      setTicket({ ...ticket, status: 'Resolved' })
      // Notify the employee that it's fixed!
      await supabase.from('notifications').insert({
        user_id: ticket.raised_by,
        title: "Ticket Resolved!",
        message: `Your request has been completed: ${ticket.title}`,
        link: `/tickets/${ticket.id}`
      })
    }
    
    setIsResolving(false)
  }

  if (isLoading) {
    return <div className="flex justify-center p-32"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
  }

  if (accessDenied || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-black text-slate-800">Access Denied</h2>
        <p className="text-slate-500 mt-2">You do not have permission to view this ticket.</p>
        <Link href="/tickets" className="mt-6 px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700">Back to Helpdesk</Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-20">
      
      {/* ── Header Bar ── */}
      <div className="flex items-center gap-4">
        <Link href="/tickets" className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 shadow-sm transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">{ticket.title}</h2>
            {ticket.status === 'Resolved' ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3"/> Resolved
              </span>
            ) : ticket.status === 'Pending Info' ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                Pending Info
              </span>
            ) : ticket.status === 'Open' ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">
                Open
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">
                In Progress
              </span>
            )}
          </div>
          <div className="text-xs font-semibold text-slate-500 flex items-center gap-3">
            <span className="flex items-center gap-1"><UserIcon className="w-3 h-3"/> Raised by {ticket.raised_user?.full_name}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {new Date(ticket.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        </div>
        
        {/* Admin Action: Resolve Button */}
        {isSuperAdmin && ticket.status !== 'Resolved' && (
          <button 
            onClick={handleResolveTicket}
            disabled={isResolving}
            className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isResolving ? <Loader2 className="w-4 h-4 animate-spin"/> : <ShieldCheck className="w-4 h-4"/>}
            Mark as Resolved
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* ── Left Column: Ticket Context & Chat ── */}
        <div className="md:col-span-2 flex flex-col gap-6">
          
          {/* Original Request Box */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Original Request</span>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            </div>
          </div>

          {/* Chat Thread */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Communication Thread</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50/50">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <p className="text-sm font-medium">No messages yet.</p>
                  <p className="text-xs">Use the chat below to ask for clarification.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === user?.id
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end ml-auto' : 'self-start items-start'}`}>
                      <span className="text-[10px] font-bold text-slate-400 mb-1 px-1">
                        {isMe ? 'You' : msg.sender?.full_name} • {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                        {msg.message}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            {ticket.status !== 'Resolved' ? (
              <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex gap-2">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..." 
                  className="flex-1 px-4 py-2.5 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-lg text-sm outline-none transition-all"
                />
                <button 
                  type="submit" 
                  disabled={!newMessage.trim() || isSending}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
                </button>
              </form>
            ) : (
              <div className="p-4 bg-slate-100 border-t border-slate-200 text-center text-xs font-bold text-slate-500">
                This ticket has been resolved and the chat is closed.
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Meta Info ── */}
        <div className="flex flex-col gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Ticket Details</h3>
            
            <div className="space-y-4">
              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Category</span>
                <span className="text-sm font-bold text-slate-700">{ticket.category}</span>
              </div>
              
              {ticket.reference_text && (
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Reference Record</span>
                  <div className="mt-1 flex items-center gap-1 text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded inline-flex border border-slate-200">
                    <Hash className="w-3 h-3"/> {ticket.reference_text}
                  </div>
                </div>
              )}

              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Assigned To</span>
                {ticket.assigned_to ? (
                  <span className="text-sm font-bold text-blue-700 flex items-center gap-1 mt-0.5"><UserIcon className="w-3 h-3"/> {ticket.assigned_user?.full_name}</span>
                ) : (
                  <span className="text-sm font-semibold text-slate-400 italic">Unassigned</span>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}