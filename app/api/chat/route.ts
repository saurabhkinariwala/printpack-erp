import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { Client } from 'pg';

export const maxDuration = 60;

const SYSTEM_PROMPT = `
You are the intelligent ERP Assistant for a manufacturing and retail firm. 
Your job is to answer the user's questions accurately by querying the PostgreSQL database using the 'execute_sql' tool.

CRITICAL RULES:
1. ALWAYS use the 'execute_sql' tool to fetch real data before answering. Never guess.
2. ONLY write standard PostgreSQL SELECT queries. 
3. If the user asks for a table, format your final response using Markdown tables.

DATABASE SCHEMA:
- 'customers': id (UUID), name, mobile, billing_address, city, state, gst_number
- 'items': id (UUID), name, sku, price, pack_size, gst_rate, sub_category_id, sub_sub_category_id
- 'locations': id (UUID), name, type (e.g., 'Godown', 'Office')
- 'stock': item_id (UUID), location_id (UUID), quantity (INT)
- 'stock_ledger': id, item_id, from_location_id, to_location_id, quantity, transaction_type ('Sale', 'Refund', 'Manufacture', 'Adjustment'), created_at, notes
- 'orders': id (UUID), order_number, order_date, total_amount, status ('Pending', 'Completed', 'Cancelled'), customer_id
- 'order_items': id, order_id, item_id, quantity_ordered, unit_price
- 'cash_memos': id (UUID), memo_number, memo_date, total_amount, customer_name, customer_mobile
- 'cash_memo_items': id, memo_id, item_id, quantity, unit_price
- 'payments': id, order_id (UUID, nullable), cash_memo_id (UUID, nullable), amount, payment_mode, payment_date
`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  try {
    // ─── STEP 1: Let the AI think and run the SQL Query ───
    const result1 = await generateText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        execute_sql: tool({
          description: 'Executes a raw PostgreSQL SELECT query against the ERP database to fetch required information.',
          inputSchema: z.object({
            query: z.string().describe('The PostgreSQL SELECT query to run.'),
          }),
          execute: async ({ query }) => {
            console.log("\n🤖 AI is running SQL Query --->", query); 
            
            if (!query.trim().toUpperCase().startsWith('SELECT')) {
              return JSON.stringify({ error: "Security violation: Only SELECT queries are allowed." });
            }

            const client = new Client({ connectionString: process.env.SUPABASE_READONLY_DB_URL });
            
            try {
              await client.connect();
              const res = await client.query(query);
              console.log(`✅ Query Success! Returned ${res.rows.length} rows.`);
              return JSON.stringify(res.rows); 
            } catch (error: any) {
              console.error("❌ SQL Error:", error.message);
              return JSON.stringify({ error: error.message });
            } finally {
              await client.end();
            }
          },
        }),
      },
    });

    // ─── STEP 2: The Bulletproof Manual Loop ───
    if (result1.toolResults && result1.toolResults.length > 0) {
      console.log("🔄 Tool detected! Safely feeding data back to LLM...");

      // Extract the raw JSON string directly
      const rawDbData = (result1.toolResults[0] as any).result;

      // Make a fresh, safe call to Gemini to format the data
      const result2 = await generateText({
        model: google('gemini-2.5-flash'),
        system: "You are a helpful ERP assistant. Read the provided database JSON and answer the user's question clearly. Use Markdown tables if there are multiple records.",
        messages: [
          ...messages,
          { 
            role: "user", 
            content: `SYSTEM INSTRUCTION: The database returned this raw data: ${rawDbData}\n\nBased ONLY on this data, answer my original question.` 
          }
        ], 
      });

      console.log("📝 Final LLM Text generated successfully.");
      return Response.json({ reply: result2.text });
    }

    // Fallback if no tool was used
    return Response.json({ reply: result1.text || "Sorry, I couldn't formulate an answer." });
    
  } catch (error: any) {
    console.error("Critical AI API Error:", error.message || error);
    
    // ⚡ Catch the specific 429 Quota Error
    if (error?.statusCode === 429 || error?.message?.includes("429") || error?.message?.includes("Quota")) {
      return Response.json({ reply: "I'm receiving too many requests right now! Google's free tier has a strict speed limit. Please wait about 60 seconds and try again." });
    }

    return Response.json({ reply: "I encountered a server error while processing the data. Please try again." });
  }
}