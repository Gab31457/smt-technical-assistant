import { NextResponse } from "next/server";

import {
  DEFAULT_VECTOR_SEARCH_OPTIONS,
  searchSimilarChunks,
} from "@/lib/vector-search";

/*
 * Az endpoint Node.js futtatókörnyezetet használ,
 * mert PostgreSQL- és OpenAI-kapcsolatra van szüksége.
 */
export const runtime = "nodejs";

/*
 * A POST kérés JSON törzsének lehetséges mezői.
 *
 * unknown típust használunk, mert a kliens által küldött
 * adatokban még nem bízhatunk meg.
 */
interface SearchRequestBody {
  query?: unknown;
  limit?: unknown;
  minimumSimilarity?: unknown;
}

/*
 * POST /api/search
 *
 * Példakérés:
 *
 * {
 *   "query": "Paradicsomos tésztát keresek",
 *   "limit": 5,
 *   "minimumSimilarity": 0.2
 * }
 */
export async function POST(request: Request) {
  try {
    /*
     * A JSON kérés beolvasása.
     */
    const requestBody =
      (await request.json()) as SearchRequestBody;

    /*
     * A query mezőnek szövegnek kell lennie.
     */
    if (typeof requestBody.query !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SEARCH_QUERY_MISSING",
            message:
              "A query szöveges mező megadása kötelező.",
          },
        },
        {
          status: 400,
        }
      );
    }

    const normalizedQuery =
      requestBody.query.trim();

    /*
     * Üres keresőkérdés ellenőrzése.
     */
    if (normalizedQuery.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SEARCH_QUERY_EMPTY",
            message:
              "A keresőkérdés nem lehet üres.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Túl hosszú kérdés ellenőrzése.
     */
    if (normalizedQuery.length > 2000) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SEARCH_QUERY_TOO_LONG",
            message:
              "A keresőkérdés legfeljebb 2000 karakter hosszú lehet.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Ha a kliens nem ad meg limitet,
     * az alapértelmezett értéket használjuk.
     */
    const limit =
      requestBody.limit === undefined
        ? DEFAULT_VECTOR_SEARCH_OPTIONS.limit
        : requestBody.limit;

    /*
     * A limit típusának ellenőrzése.
     */
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 20
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SEARCH_LIMIT",
            message:
              "A limit értékének 1 és 20 közötti egész számnak kell lennie.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Ha a kliens nem ad meg similarity küszöböt,
     * az alapértelmezett értéket használjuk.
     */
    const minimumSimilarity =
      requestBody.minimumSimilarity === undefined
        ? DEFAULT_VECTOR_SEARCH_OPTIONS.minimumSimilarity
        : requestBody.minimumSimilarity;

    /*
     * A similarity küszöb ellenőrzése.
     */
    if (
      typeof minimumSimilarity !== "number" ||
      !Number.isFinite(minimumSimilarity) ||
      minimumSimilarity < -1 ||
      minimumSimilarity > 1
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SIMILARITY_THRESHOLD",
            message:
              "A minimumSimilarity értékének -1 és 1 között kell lennie.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Szemantikus keresés végrehajtása.
     */
    const results = await searchSimilarChunks(
      normalizedQuery,
      {
        limit,
        minimumSimilarity,
      }
    );

    /*
     * A válaszban a kérdés és a ténylegesen használt
     * keresési beállítások is megjelennek.
     */
    return NextResponse.json(
      {
        success: true,
        query: normalizedQuery,
        searchOptions: {
          limit,
          minimumSimilarity,
        },
        count: results.length,
        results,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    /*
     * A részletes technikai hiba a szerver
     * termináljába kerül.
     */
    console.error(
      "Semantic search failed:",
      error
    );

    /*
     * A kliensnek általános hibaüzenetet küldünk.
     */
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SEMANTIC_SEARCH_FAILED",
          message:
            "A szemantikus keresés közben váratlan hiba történt.",
        },
      },
      {
        status: 500,
      }
    );
  }
}