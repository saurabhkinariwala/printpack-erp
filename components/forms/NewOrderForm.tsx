"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// 1. Define the exact shape of your data using Zod
const orderSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  isNewCustomer: z.boolean(),
  customerGst: z.string().optional(),
  customerMobile: z.string().optional(),
  transportDetails: z.string().optional(),
  items: z.array(z.object({
    itemId: z.string(),
    quantity: z.number().min(1),
    price: z.number().min(0)
  })).min(1, "Add at least one item")
})

type OrderFormValues = z.infer<typeof orderSchema>

// Dummy data for the UI (We will replace this with Supabase data later)
const dummyCustomers = [
  { id: "1", name: "Tech Solutions Inc.", type: "Repetitive" },
  { id: "2", name: "Global Logistics", type: "Repetitive" },
]

export function NewOrderForm() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isNewCustomer, setIsNewCustomer] = useState(false)

  // Initialize the form with React Hook Form
  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      isNewCustomer: false,
      items: [{ itemId: "", quantity: 1, price: 0 }]
    }
  })

  // Filter dummy customers based on search
  const filteredCustomers = dummyCustomers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const onSubmit = async (data: OrderFormValues) => {
    console.log("Form Data ready for Supabase:", data)
    // Here we will eventually write the Supabase INSERT logic
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-20">
      
      {/* --- SECTION 1: CUSTOMER DETAILS --- */}
      <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Smart Search Field */}
          <div className="space-y-2">
            <Label>Search Customer</Label>
            <Input 
              placeholder="Type customer name..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                form.setValue("customerName", e.target.value)
                setIsNewCustomer(false) // Reset new customer state while typing
              }}
            />
          </div>

          {/* Conditional UI: Show existing matches OR prompt to create new */}
          {searchQuery && filteredCustomers.length > 0 && !isNewCustomer && (
            <div className="flex flex-col gap-2 rounded-md border p-2">
              <span className="text-xs font-medium text-zinc-500 px-2">Existing Customers Found:</span>
              {filteredCustomers.map(customer => (
                <Button 
                  key={customer.id}
                  type="button" 
                  variant="ghost" 
                  className="justify-start"
                  onClick={() => {
                    form.setValue("customerId", customer.id)
                    form.setValue("customerName", customer.name)
                    setSearchQuery(customer.name)
                  }}
                >
                  {customer.name}
                  <Badge variant="secondary" className="ml-auto">{customer.type}</Badge>
                </Button>
              ))}
            </div>
          )}

          {searchQuery && filteredCustomers.length === 0 && !isNewCustomer && (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 p-6 bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-800">
              <p className="text-sm text-zinc-500 mb-4">No repetitive customer found.</p>
              <Button 
                type="button" 
                onClick={() => {
                  setIsNewCustomer(true)
                  form.setValue("isNewCustomer", true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Register as New Customer
              </Button>
            </div>
          )}

          {/* Conditional UI: New Customer Fields (Slides open) */}
          {isNewCustomer && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border p-4 bg-zinc-50 dark:bg-zinc-900">
               <div className="space-y-2">
                  <Label>GST Number (Optional)</Label>
                  <Input {...form.register("customerGst")} placeholder="e.g. 27AADCB2230M1Z2" />
               </div>
               <div className="space-y-2">
                  <Label>Mobile Number</Label>
                  <Input {...form.register("customerMobile")} placeholder="e.g. +91 9876543210" />
               </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- SECTION 2 & 3 PLACEHOLDERS (We will build these next) --- */}
      <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Order Items & Inventory Check</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Line item rows with multi-location stock badges will go here.</p>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full md:w-auto">Save Order & Generate Note</Button>
    </form>
  )
}