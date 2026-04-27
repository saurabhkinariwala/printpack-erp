"use client"

import { useState, useRef, useEffect } from "react"
import { MessageSquare, X, Send, Loader2, Bot, Download } from "lucide-react"
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─── 1. CUSTOM TABLE EXPORT COMPONENT ─────────────────────────────────────────
// Defined outside the main component so it doesn't remount on every keystroke
const ExportableTable = ({ node, ...props }: any) => {
  const tableRef = useRef<HTMLTableElement>(null);

  const handleExportToExcel = () => {
    if (!tableRef.current) return;
    
    // Grab all rows from the rendered HTML table
    const rows = Array.from(tableRef.current.querySelectorAll('tr'));
    
    // Map rows and cells to a CSV format
    const csvContent = rows.map(row => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map(cell => {
        // Escape quotes to prevent CSV breakage
        const text = cell.textContent?.replace(/"/g, '""') || '';
        return `"${text}"`; // Wrap every cell in quotes
      }).join(',');
    }).join('\n');

    // Create a Blob and trigger a native browser download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'ERP_Data_Export.csv'); // Excel opens CSV natively
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="my-4 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table ref={tableRef} className="min-w-full divide-y divide-slate-200 text-sm" {...props} />
      </div>
      {/* The Export Toolbar below the table */}
      <div className="bg-slate-50 p-2.5 border-t border-slate-200 flex justify-end">
        <button 
          onClick={handleExportToExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded shadow-sm transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export to Excel
        </button>
      </div>
    </div>
  );
};


// ─── 2. MAIN CHATBOT COMPONENT ────────────────────────────────────────────────
export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<{ role: "user" | "assistant", content: string }[]>([
    { role: "assistant", content: "Hi! I'm your ERP Assistant. Ask me about orders, cash memos, or stock levels!" }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ⚡ Resize State
  const [sidebarWidth, setSidebarWidth] = useState(400)
  const [isResizing, setIsResizing] = useState(false)

  // ⚡ Resize Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // Calculate new width (from right edge of screen to mouse X)
      const newWidth = document.body.clientWidth - e.clientX;
      
      // Clamp the width so they can't make it too small or wider than the screen
      if (newWidth >= 320 && newWidth <= 1200) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = ''; // Re-enable text selection
    };

    if (isResizing) {
      document.body.style.userSelect = 'none'; // Prevent text highlighting while dragging
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isResizing]);


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

    const newMessages = [...messages, { role: "user" as const, content: userMsg }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })

      if (!response.ok) throw new Error("Server error");

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
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-2xl hover:bg-blue-700 transition-all z-40 ${isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100 hover:scale-110"}`}
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* ⚡ Applied dynamic width and max-w-full (so mobile doesn't overflow) */}
      <div 
        style={{ width: `${sidebarWidth}px`, maxWidth: '100%' }}
        className={`fixed top-0 right-0 h-full bg-white shadow-2xl border-l border-slate-200 z-50 transform transition-transform duration-300 flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >

        {/* ⚡ THE DRAG HANDLE (Only visible on desktop, hidden on mobile via sm:flex) */}
        <div
          onMouseDown={() => setIsResizing(true)}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hidden sm:flex items-center justify-center z-50 hover:bg-blue-500/10 group transition-colors"
          title="Drag to resize"
        >
          <div className={`w-1 h-12 rounded-full transition-colors ${isResizing ? 'bg-blue-600' : 'bg-slate-300 group-hover:bg-blue-400'}`} />
        </div>

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
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
              <div className={`rounded-lg p-4 max-w-[85%] ${message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 shadow-sm text-slate-800'
                }`}>

                {message.role === 'user' ? (
                  <p className="text-sm">{message.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-slate">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // ⚡ Inject our custom table handler here
                        table: ExportableTable,
                        th: ({ node, ...props }) => <th className="bg-slate-100 px-4 py-2.5 text-left font-bold text-slate-700" {...props} />,
                        td: ({ node, ...props }) => <td className="px-4 py-2.5 whitespace-nowrap" {...props} />,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
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

      {isOpen && (
        <div className="fixed inset-0 bg-black/20 z-30 sm:hidden backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      )}
    </>
  )
}