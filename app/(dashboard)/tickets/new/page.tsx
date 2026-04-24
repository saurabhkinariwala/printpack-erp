"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/context/AuthContext"
import { FileText, Receipt, HelpCircle, Loader2, Send, ArrowLeft, Hash } from "lucide-react"
import Link from "next/link"

const CATEGORIES = [
  { id: 'Cash Memo', icon: Receipt, desc: 'Corrections for counter sales', prefix: 'CM-' },
  { id: 'Inward Register', icon: FileText, desc: 'Fixes for vendor stock receipts', prefix: 'DM-' },
  { id: 'General Query', icon: HelpCircle, desc: 'Other system or account issues', prefix: '' }
]

export default function NewTicketPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  // ⚡ SMART AUTO-FILL
  const [category, setCategory] = useState<string>(searchParams.get('category') || "")
  // We no longer need the UUID referenceId, just the text the user types
  const [referenceText, setReferenceText] = useState<string>(searchParams.get('refText') || "")
  
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return alert("You must be logged in to raise a ticket.")
    
    const formattedRefText = referenceText.trim().toUpperCase()

    if (category !== 'General Query') {
      if (!formattedRefText) return alert("Please enter the reference number.")
      
      // 1. Client-Side Format Validation
      if (category === 'Cash Memo' && !/^CM-\d+$/.test(formattedRefText)) {
        return alert("Cash Memo must be in the format CM-XXXX (e.g., CM-1042)")
      }
      if (category === 'Inward Register' && !/^DM-\d+$/.test(formattedRefText)) {
        return alert("DM Number must be in the format DM-XXXX (e.g., DM-1042)")
      }

      setIsSubmitting(true)

      // 2. Database Existence Validation (Make sure it actually exists!)
      let table = category === 'Cash Memo' ? 'cash_memos' : 'inward_receipts'
      let column = category === 'Cash Memo' ? 'memo_number' : 'dm_number'

      const { count, error: checkError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, formattedRefText)

      if (checkError) {
        alert("Error verifying record: " + checkError.message)
        setIsSubmitting(false)
        return
      }

      if (count === 0) {
        alert(`The record ${formattedRefText} does not exist in the database. Please check the number.`)
        setIsSubmitting(false)
        return
      }
    } else {
      setIsSubmitting(true)
    }

    // 3. Create the Ticket
    const { data: ticket, error: ticketError } = await supabase.from('tickets').insert({
      category,
      reference_id: null, // Left null since we are using text
      reference_text: category === 'General Query' ? null : formattedRefText,
      title,
      description,
      raised_by: user.id,
      status: 'Open'
    }).select().single()

    if (ticketError) {
      alert("Error creating ticket: " + ticketError.message)
      setIsSubmitting(false)
      return
    }

    // 4. Fire a Notification to all Admins
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
    
    if (admins && admins.length > 0) {
      const notifications = admins.map((admin: any) => ({
        user_id: admin.id,
        title: "New Ticket Received",
        message: `${user.full_name || 'An employee'} raised a ticket for ${category}.`,
        link: `/tickets/${ticket.id}`
      }))
      await supabase.from('notifications').insert(notifications)
    }

    router.push('/tickets')
  }

  const activeCategoryConfig = CATEGORIES.find(c => c.id === category)

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-20">
      
      <div className="flex items-center gap-4">
        <Link href="/tickets" className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 shadow-sm transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h2 className="text-2xl font-black text-slate-800">Raise a Support Ticket</h2>
          <p className="text-sm text-slate-500">Need a correction or help? Submit a request to the admin team.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* STEP 1: CATEGORY */}
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">1. What do you need help with?</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CATEGORIES.map(c => {
              const Icon = c.icon
              const isSelected = category === c.id
              return (
                <button key={c.id} type="button" onClick={() => { setCategory(c.id); setReferenceText(""); }} className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-2 ${isSelected ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                  <Icon className={`w-6 h-6 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div>
                    <h3 className={`font-bold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{c.id}</h3>
                    <p className="text-[10px] text-slate-500 mt-1 leading-tight">{c.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-6 space-y-6">
          
          {/* STEP 2: SIMPLE TEXT REFERENCE */}
          {category && category !== 'General Query' && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">2. Enter the specific {category} number</label>
              <div className="relative max-w-md">
                <Hash className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder={`e.g. ${activeCategoryConfig?.prefix}1042`} 
                  value={referenceText} 
                  onChange={e => setReferenceText(e.target.value.toUpperCase())} 
                  className="w-full p-3 pl-10 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 uppercase" 
                />
              </div>
            </div>
          )}

          {/* STEP 3: DETAILS */}
          {category && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300 delay-100">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-2">3. Issue Details</label>
              
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Subject / Short Title *</label>
                <input type="text" required placeholder="e.g., Wrong quantity entered" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Detailed Description *</label>
                <textarea required rows={5} placeholder="Please describe exactly what needs to be changed..." value={description} onChange={e => setDescription(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button type="submit" disabled={!category || isSubmitting || (category !== 'General Query' && !referenceText)} className="px-8 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Submit Ticket
          </button>
        </div>
      </form>
    </div>
  )
}