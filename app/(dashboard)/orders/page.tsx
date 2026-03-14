"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Search, Plus, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, MapPin, Phone, Edit2, Trash2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

type Order = {
  id: string; order_number: string; created_at: string; status: string; total_amount: number;
  customers: { name: string; mobile: string; city: string; state: string };
  payments: { amount: number }[];
  order_items?: { quantity_ordered: number }[];
  dispatch_notes?: { dispatch_items: { quantity_dispatched: number }[] }[];
};

type SortConfig = { key: 'order_number' | 'created_at' | 'customer_name' | 'total_amount' | 'status' | 'payment' | 'delivery'; direction: 'asc' | 'desc' };

export default function OrdersListPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'order_number', direction: 'desc' })

  const { hasPermission } = useAuth() 
  const supabase = createClient()

  useEffect(() => {
    fetchOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function fetchOrders() {
    setIsLoading(true);
    const { data } = await supabase.from('orders').select(`
      id, order_number, created_at, status, total_amount,
      customers (name, mobile, city, state),
      payments (amount),
      order_items ( quantity_ordered ),
      dispatch_notes ( dispatch_items ( quantity_dispatched ) )
    `).order('order_number', { ascending: false });
    
    if (data) setOrders(data as unknown as Order[]);
    setIsLoading(false);
  }

  const handleDelete = async (id: string, orderNumber: string) => {
    if (!window.confirm(`Are you absolutely sure you want to delete order ${orderNumber}? This will also delete all associated items and payments.`)) return;
    
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) {
      alert("Failed to delete order: " + error.message);
    } else {
      setOrders(orders.filter(o => o.id !== id));
    }
  }

  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const SortIcon = ({ columnKey }: { columnKey: SortConfig['key'] }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 inline-block" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 ml-1 inline-block" /> : <ArrowDown className="w-3 h-3 text-blue-600 ml-1 inline-block" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': 
        return <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-200 shadow-sm">Pending</span>;
      case 'partial': 
        return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-yellow-300 shadow-sm">Partial</span>;
      case 'on credit': 
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-blue-300 shadow-sm">On Credit</span>;
      case 'completed': 
        return <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-green-200 shadow-sm">Completed</span>;
      default: 
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-slate-200 shadow-sm">{status}</span>;
    }
  }

  const getDeliveryBadge = (order: Order) => {
    let totalOrdered = 0;
    let totalDispatched = 0;

    order.order_items?.forEach(item => {
      totalOrdered += item.quantity_ordered || 0;
    });

    order.dispatch_notes?.forEach(note => {
      note.dispatch_items?.forEach(di => {
        totalDispatched += di.quantity_dispatched || 0;
      });
    });

    let percent = 0;
    if (totalOrdered > 0) percent = Math.round((totalDispatched / totalOrdered) * 100);

    if (percent === 0) {
      return <span className="whitespace-nowrap px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-200 shadow-sm">0%</span>;
    } 
    if (percent >= 100) {
      return <span className="whitespace-nowrap px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-green-200 shadow-sm">100%</span>;
    }
    
    return (
      <span className="whitespace-nowrap px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-yellow-300 shadow-sm flex flex-col items-center leading-tight">
        <span>{percent}%</span>
        <span>Pend: {totalOrdered - totalDispatched}</span>
      </span>
    );
  }

  const getPaymentBadge = (totalAmount: number, payments: { amount: number }[]) => {
    const totalPaid = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
    
    let percent = 0;
    if (totalAmount > 0) percent = Math.round((totalPaid / totalAmount) * 100);
    else if (totalPaid > 0) percent = 100;
    
    if (percent === 0) {
      return <span className="whitespace-nowrap px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-200 shadow-sm">0% Paid</span>;
    } 
    if (percent >= 100) {
      return <span className="whitespace-nowrap px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-green-200 shadow-sm">100% Paid</span>;
    }
    
    return (
      <span className="whitespace-nowrap px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-[10px] font-black uppercase tracking-wider border border-yellow-300 shadow-sm flex flex-col items-center leading-tight">
        <span>{percent}% Paid</span>
        <span>Bal: ₹{(totalAmount - totalPaid).toLocaleString()}</span>
      </span>
    );
  }

  let filteredOrders = orders.filter(o => 
    o.order_number.toLowerCase().includes(search.toLowerCase()) || 
    o.customers?.name.toLowerCase().includes(search.toLowerCase()) ||
    o.customers?.mobile.includes(search)
  );

  filteredOrders.sort((a, b) => {
    let aValue: any = a[sortConfig.key as keyof Order];
    let bValue: any = b[sortConfig.key as keyof Order];

    if (sortConfig.key === 'customer_name') {
      aValue = a.customers?.name || "";
      bValue = b.customers?.name || "";
    }
    if (sortConfig.key === 'payment') {
      const aPaid = a.payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const bPaid = b.payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      aValue = a.total_amount > 0 ? aPaid / a.total_amount : 0;
      bValue = b.total_amount > 0 ? bPaid / b.total_amount : 0;
    }
    if (sortConfig.key === 'delivery') {
      const getDelPct = (o: Order) => {
        let tO = 0, tD = 0;
        o.order_items?.forEach(i => tO += i.quantity_ordered || 0);
        o.dispatch_notes?.forEach(n => n.dispatch_items?.forEach(di => tD += di.quantity_dispatched || 0));
        return tO > 0 ? tD / tO : 0;
      };
      aValue = getDelPct(a);
      bValue = getDelPct(b);
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6 pb-20">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Master Orders List</h2>
          <p className="text-sm text-slate-500">View, sort, edit, and track payments for all customer orders.</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search Order No, Name, or Mobile..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <Link href="/orders/new" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow font-bold flex items-center justify-center gap-2 shrink-0 transition-colors">
            <Plus className="w-5 h-5" /> New Order
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500 font-bold select-none tracking-wider">
              <tr>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('order_number')}>Order No <SortIcon columnKey="order_number" /></th>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('created_at')}>Date <SortIcon columnKey="created_at" /></th>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('customer_name')}>Customer Details <SortIcon columnKey="customer_name" /></th>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors text-center" onClick={() => handleSort('status')}>Order Status <SortIcon columnKey="status" /></th>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors text-center" onClick={() => handleSort('delivery')}>Delivered <SortIcon columnKey="delivery" /></th>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors text-center" onClick={() => handleSort('payment')}>Payment <SortIcon columnKey="payment" /></th>
                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors text-right" onClick={() => handleSort('total_amount')}>Total Amount <SortIcon columnKey="total_amount" /></th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500 font-medium">Loading orders...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500 font-medium">No orders found matching your search.</td></tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-black text-slate-800">{order.order_number}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-sm">{order.customers?.name || 'Unknown'}</div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1 font-mono"><Phone className="w-3 h-3 text-slate-400"/> {order.customers?.mobile}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400"/> {order.customers?.city || 'No City'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-4 text-center">{getDeliveryBadge(order)}</td>
                    <td className="px-6 py-4 text-center">{getPaymentBadge(order.total_amount, order.payments)}</td>
                    <td className="px-6 py-4 text-right font-black text-slate-800 text-base">₹{order.total_amount.toLocaleString()}</td>
                    
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link href={`/orders/${order.id}`} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 rounded shadow-sm transition-all" title="View Order">
                          <ExternalLink className="w-4 h-4"/>
                        </Link>
                        {hasPermission('edit_orders') && (
                        <Link href={`/orders/${order.id}/edit`} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-green-600 hover:border-green-300 hover:bg-green-50 rounded shadow-sm transition-all" title="Edit Order">
                          <Edit2 className="w-4 h-4"/>
                        </Link>
                        )}
                        <button onClick={() => handleDelete(order.id, order.order_number)} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-red-600 hover:border-red-300 hover:bg-red-50 rounded shadow-sm transition-all" title="Delete Order">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}