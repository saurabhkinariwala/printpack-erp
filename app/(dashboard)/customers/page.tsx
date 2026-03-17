"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  Search, User, ChevronDown, X, ArrowUpRight, Calendar,
  TrendingDown, TrendingUp, Scale, Phone, MapPin
} from "lucide-react"

type Customer = {
  id: string; name: string; mobile: string | null
  city: string | null; state: string | null; is_favorite: boolean; is_repetitive: boolean
}

type LedgerEntry = {
  date: string
  particulars: string
  particulars_detail: string
  debit: number     // order = debit (customer owes us)
  credit: number    // payment = credit (customer pays)
  type: "order" | "payment"
  order_id?: string
  order_number?: string
}

function fmt(n: number) { return "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN") }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export default function CustomerLedgerPage() {
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split("T")[0]
  const firstOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]

  // Customer search
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Date range
  const [startDate, setStartDate] = useState(firstOfYear)
  const [endDate, setEndDate] = useState(today)

  // Ledger
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [openingBalance, setOpeningBalance] = useState(0) // balance before startDate
  const [isLedgerLoading, setIsLedgerLoading] = useState(false)

  // ── Fetch favourite/repetitive customers ──
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("customers")
        .select("id, name, mobile, city, state, is_favorite, is_repetitive")
        .or("is_favorite.eq.true,is_repetitive.eq.true")
        .order("name")
      if (data) setCustomers(data as Customer[])
    }
    load()
  }, [supabase])

  // ── Dropdown filter ──
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.mobile?.includes(searchTerm) || false
  )

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c)
    setSearchTerm(c.name)
    setIsDropdownOpen(false)
  }

  const clearCustomer = () => {
    setSelectedCustomer(null)
    setSearchTerm("")
    setLedger([])
    setOpeningBalance(0)
    inputRef.current?.focus()
  }

  // ── Fetch Ledger ──
  const fetchLedger = useCallback(async () => {
    if (!selectedCustomer) return
    setIsLedgerLoading(true)

    // 1. All orders for this customer
    const { data: ordersData } = await supabase
      .from("orders")
      .select(`
        id, order_number, order_date, total_amount,
        payments(id, amount, payment_mode, payment_date, transaction_reference)
      `)
      .eq("customer_id", selectedCustomer.id)
      .order("order_date", { ascending: true })

    if (!ordersData) { setIsLedgerLoading(false); return }

    const entries: LedgerEntry[] = []
    let openBal = 0

    ordersData.forEach((o: any) => {
      const orderDate = o.order_date // YYYY-MM-DD

      // ── Add order entry ──
      if (orderDate >= startDate && orderDate <= endDate) {
        entries.push({
          date: orderDate,
          particulars: `Order #${o.order_number}`,
          particulars_detail: o.order_number,
          debit: Number(o.total_amount),
          credit: 0,
          type: "order",
          order_id: o.id,
          order_number: o.order_number,
        })
      } else if (orderDate < startDate) {
        openBal += Number(o.total_amount)
      }

      // ── Add payment entries ──
      o.payments?.forEach((p: any) => {
        const payDate = p.payment_date ? p.payment_date.split("T")[0] : orderDate
        const modeLabel = p.payment_mode || "Payment"
        const refStr = p.transaction_reference ? ` · Ref: ${p.transaction_reference}` : ""

        if (payDate >= startDate && payDate <= endDate) {
          entries.push({
            date: payDate,
            particulars: `Payment · ${modeLabel}`,
            particulars_detail: `${modeLabel}${refStr}`,
            debit: 0,
            credit: Number(p.amount),
            type: "payment",
            order_id: o.id,
            order_number: o.order_number,
          })
        } else if (payDate < startDate) {
          openBal -= Number(p.amount)
        }
      })
    })

    // sort by date
    entries.sort((a, b) => a.date.localeCompare(b.date))
    setOpeningBalance(openBal)
    setLedger(entries)
    setIsLedgerLoading(false)
  }, [selectedCustomer, startDate, endDate, supabase])

  useEffect(() => {
    if (selectedCustomer) fetchLedger()
  }, [selectedCustomer, startDate, endDate, fetchLedger])

  // ── Running balance ──
  let runningBalance = openingBalance
  const ledgerWithBalance = ledger.map(entry => {
    runningBalance += entry.debit - entry.credit
    return { ...entry, balance: runningBalance }
  })
  const closingBalance = runningBalance

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Customer Ledger</h2>
        <p className="text-sm text-slate-500 mt-0.5">Tally-style account statement for any customer</p>
      </div>

      {/* ── Customer Search + Date Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row gap-4">

        {/* Autocomplete Dropdown */}
        <div className="relative flex-1" ref={dropdownRef}>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Select Customer</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setIsDropdownOpen(true); if (!e.target.value) clearCustomer() }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Search favourite / regular customers…"
              className="w-full pl-9 pr-10 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-medium"
            />
            {selectedCustomer ? (
              <button onClick={clearCustomer} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            )}
          </div>

          {isDropdownOpen && filteredCustomers.length > 0 && (
            <div className="absolute z-30 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {filteredCustomers.map(c => (
                <button
                  key={c.id}
                  onMouseDown={() => selectCustomer(c)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {c.mobile && <span className="text-xs text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3"/>{c.mobile}</span>}
                      {c.city && <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3"/>{c.city}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {c.is_favorite && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">⭐ Fav</span>}
                    {c.is_repetitive && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">Regular</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {isDropdownOpen && searchTerm && filteredCustomers.length === 0 && (
            <div className="absolute z-30 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-center text-sm text-slate-400">
              No matching customers found
            </div>
          )}
        </div>

        {/* Date Range */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Period</label>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="pl-8 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 font-medium" />
            </div>
            <span className="text-slate-400 text-sm">–</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 font-medium" />
          </div>
        </div>
      </div>

      {/* ── Customer Info Strip ── */}
      {selectedCustomer && (
        <div className="bg-slate-800 rounded-xl p-4 text-white flex flex-wrap items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center font-black text-lg shrink-0">
            {selectedCustomer.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg leading-tight">{selectedCustomer.name}</h3>
            <div className="flex items-center gap-4 mt-0.5">
              {selectedCustomer.mobile && <span className="text-slate-400 text-xs flex items-center gap-1"><Phone className="h-3 w-3"/>{selectedCustomer.mobile}</span>}
              {selectedCustomer.city && <span className="text-slate-400 text-xs flex items-center gap-1"><MapPin className="h-3 w-3"/>{selectedCustomer.city}, {selectedCustomer.state}</span>}
            </div>
          </div>
          <div className="flex gap-3">
            {selectedCustomer.is_favorite && <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full font-bold">⭐ Favourite</span>}
            {selectedCustomer.is_repetitive && <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded-full font-bold">Regular Customer</span>}
          </div>
        </div>
      )}

      {/* ── Ledger ── */}
      {!selectedCustomer ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-20 flex flex-col items-center justify-center text-center">
          <User className="h-12 w-12 text-slate-200 mb-4" />
          <h3 className="font-bold text-slate-500">Select a Customer</h3>
          <p className="text-sm text-slate-400 mt-1">Choose a customer above to view their Tally-style ledger</p>
        </div>
      ) : isLedgerLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-20 text-center text-slate-400 text-sm">Loading ledger...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Ledger Header */}
          <div className="bg-slate-900 text-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Account Statement</p>
                <h3 className="text-lg font-black">{selectedCustomer.name}</h3>
                <p className="text-slate-400 text-xs mt-1">
                  {fmtDate(startDate)} — {fmtDate(endDate)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Closing Balance</p>
                <p className={`text-3xl font-black ${closingBalance >= 0 ? "text-amber-300" : "text-green-300"}`}>
                  {fmt(closingBalance)}
                </p>
                <p className={`text-xs font-bold mt-1 ${closingBalance >= 0 ? "text-amber-400" : "text-green-400"}`}>
                  {closingBalance >= 0 ? "To Receive (Dr)" : "To Pay (Cr)"}
                </p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase">Particulars</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-red-500 uppercase whitespace-nowrap">Debit (Dr)</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-green-600 uppercase whitespace-nowrap">Credit (Cr)</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">

                {/* Opening Balance Row */}
                <tr className="bg-slate-50">
                  <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap font-mono">{fmtDate(startDate)}</td>
                  <td className="px-5 py-3">
                    <p className="font-bold text-slate-600 text-xs">Opening Balance</p>
                    <p className="text-[10px] text-slate-400">Carried forward from before {fmtDate(startDate)}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {openingBalance > 0 && <span className="font-bold text-red-600 text-sm">{fmt(openingBalance)}</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {openingBalance < 0 && <span className="font-bold text-green-600 text-sm">{fmt(Math.abs(openingBalance))}</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-black text-sm ${openingBalance >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmt(openingBalance)}
                    </span>
                    <p className="text-[10px] text-slate-400">{openingBalance >= 0 ? "Dr" : "Cr"}</p>
                  </td>
                </tr>

                {/* Ledger Entries */}
                {ledgerWithBalance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 text-sm">
                      No transactions in this period
                    </td>
                  </tr>
                ) : (
                  ledgerWithBalance.map((entry, i) => (
                    <tr key={i} className={`hover:bg-slate-50 transition-colors ${entry.type === "payment" ? "bg-green-50/30" : ""}`}>
                      <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap font-mono">
                        {fmtDate(entry.date)}
                      </td>
                      <td className="px-5 py-3.5">
                        {entry.type === "order" ? (
                          <button
                            onClick={() => entry.order_id && router.push(`/orders/${entry.order_id}`)}
                            className="flex items-center gap-1.5 font-bold text-blue-600 hover:text-blue-800 hover:underline text-sm"
                          >
                            Order #{entry.order_number}
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                          </button>
                        ) : (
                          <div>
                            <p className="font-semibold text-green-700 text-sm">{entry.particulars}</p>
                            {entry.order_number && (
                              <button
                                onClick={() => entry.order_id && router.push(`/orders/${entry.order_id}`)}
                                className="text-[10px] text-slate-400 hover:text-blue-600 hover:underline flex items-center gap-0.5"
                              >
                                against Order #{entry.order_number} <ArrowUpRight className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {entry.debit > 0 && (
                          <span className="font-bold text-red-600">{fmt(entry.debit)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {entry.credit > 0 && (
                          <span className="font-bold text-green-600">{fmt(entry.credit)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`font-black text-sm ${entry.balance >= 0 ? "text-slate-800" : "text-green-700"}`}>
                          {fmt(entry.balance)}
                        </span>
                        <p className={`text-[10px] font-bold ${entry.balance >= 0 ? "text-red-400" : "text-green-500"}`}>
                          {entry.balance >= 0 ? "Dr" : "Cr"}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Closing Balance Footer */}
              <tfoot className="border-t-2 border-slate-900">
                <tr className="bg-slate-900 text-white">
                  <td colSpan={2} className="px-5 py-4 font-bold text-slate-300 text-sm uppercase tracking-wide">Closing Balance</td>
                  <td className="px-5 py-4 text-right font-black text-red-300">
                    {closingBalance > 0 ? fmt(closingBalance) : "—"}
                  </td>
                  <td className="px-5 py-4 text-right font-black text-green-300">
                    {closingBalance < 0 ? fmt(Math.abs(closingBalance)) : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <p className={`font-black text-xl ${closingBalance >= 0 ? "text-amber-300" : "text-green-300"}`}>
                      {fmt(closingBalance)}
                    </p>
                    <p className={`text-xs font-bold ${closingBalance >= 0 ? "text-amber-400" : "text-green-400"}`}>
                      {closingBalance >= 0 ? "To Receive" : "Advance/Overpaid"}
                    </p>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 border-t border-slate-200">
            {[
              { label: "Total Orders (Dr)", value: fmt(ledger.reduce((s, e) => s + e.debit, 0)), icon: TrendingUp, color: "text-red-600", bg: "bg-red-50" },
              { label: "Total Payments (Cr)", value: fmt(ledger.reduce((s, e) => s + e.credit, 0)), icon: TrendingDown, color: "text-green-600", bg: "bg-green-50" },
              { label: "Net Balance Due", value: fmt(closingBalance), icon: Scale, color: closingBalance >= 0 ? "text-amber-600" : "text-green-600", bg: closingBalance >= 0 ? "bg-amber-50" : "bg-green-50" },
            ].map((s, i) => (
              <div key={i} className="p-5 flex items-center gap-3 border-r border-slate-100 last:border-0">
                <div className={`h-9 w-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold">{s.label}</p>
                  <p className={`font-black text-lg ${s.color}`}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}