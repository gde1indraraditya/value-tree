import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed-db";

// Dev helper: POST to load the example trees into PostgreSQL (idempotent).
export async function POST() {
  try {
    const result = await seedDatabase();
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
