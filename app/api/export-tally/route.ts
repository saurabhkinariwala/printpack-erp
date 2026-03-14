import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Export Tally API" });
}

export async function POST() {
  return NextResponse.json({ message: "Export Tally API" });
}
