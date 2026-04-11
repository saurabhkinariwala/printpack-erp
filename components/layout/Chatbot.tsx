"use client"

import { useState, useRef, useEffect } from "react"
import { MessageSquare, X, Send, Loader2, Bot, User } from "lucide-react"

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<{ role: "user" | "assistant", content: string }[]>([
    { role: "assistant", content: "Hi! I'm your ERP Assistant. Ask me about orders, cash memos, or stock levels!" }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

 const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMsg = input.trim()
    setInput("")
    
    // 1. Create the new array containing the entire chat history plus the new message
    const newMessages = [...messages, { role: "user" as const, content: userMsg }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }) 
      })
      
      if (!response.ok) {
        throw new Error("Server error");
      }

      // ⚡ Changed back to JSON
      const data = await response.json()
      
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }])
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error connecting to the server." }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-2xl hover:bg-blue-700 transition-all z-40 ${isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100 hover:scale-110"}`}
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Slide-out Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white shadow-2xl border-l border-slate-200 z-50 transform transition-transform duration-300 flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded-lg"><Bot className="w-5 h-5 text-blue-400" /></div>
            <div>
              <h3 className="font-bold text-sm">ERP Copilot</h3>
              <p className="text-[10px] text-slate-400">Powered by AI</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-slate-200 text-slate-600" : "bg-blue-100 text-blue-600"}`}>
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`p-3 rounded-2xl max-w-[80%] text-sm ${msg.role === "user" ? "bg-slate-800 text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-700 shadow-sm rounded-tl-sm"}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><Bot className="w-4 h-4" /></div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm rounded-tl-sm"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200 shrink-0">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about orders, stock, or customers..."
              className="w-full pl-4 pr-12 py-3 bg-slate-100 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <button type="submit" disabled={!input.trim() || isLoading} className="absolute right-2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Overlay backdrop for mobile */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 z-30 sm:hidden backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      )}
    </>
  )
}