import { loadCombinedAgentIndex, searchDocs } from "@/lib/products/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SearchBody {
  query: string;
  productId?: string;
  limit?: number;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SearchBody;
    const query = body.query?.trim();
    if (!query) {
      return Response.json({ error: "query is required" }, { status: 400 });
    }
    const index = await loadCombinedAgentIndex();
    const results = searchDocs(index, query, {
      productId: body.productId,
      limit: body.limit ?? 12,
    });
    return Response.json({ query, results });
  } catch (error) {
    console.error("docs search failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Search is temporarily unavailable" }, { status: 500 });
  }
}
