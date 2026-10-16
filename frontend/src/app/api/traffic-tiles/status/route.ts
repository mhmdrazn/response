import { usageReport } from "@/lib/server/tomtom-traffic";

// Whether the traffic layer can be shown, and how much of today's and this
// month's TomTom allowance it has used. Never cached: the count moves.
export async function GET() {
  return Response.json(await usageReport(), { headers: { "Cache-Control": "no-store" } });
}
