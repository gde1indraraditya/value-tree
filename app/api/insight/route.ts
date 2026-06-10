import { NextResponse } from "next/server";
import { generateInsight } from "@/lib/insight";
import { ValueTree } from "@/lib/types";

// Runs server-side: keeps the ANTHROPIC_API_KEY off the client and lets us swap
// the heuristic for a real Claude call without touching the front end.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { tree?: ValueTree };
    if (!body?.tree?.rootId) {
      return NextResponse.json({ error: "Missing tree" }, { status: 400 });
    }
    const insight = await generateInsight(body.tree);
    return NextResponse.json(insight);
  } catch (err) {
    return NextResponse.json({ error: "Failed to generate insight" }, { status: 500 });
  }
}
