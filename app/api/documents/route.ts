import { NextResponse } from "next/server";

import { databasePool } from "@/lib/database";

/*
 * Az endpoint Node.js futtatókörnyezetben működik,
 * mert közvetlen PostgreSQL-kapcsolatot használ.
 */
export const runtime = "nodejs";

/*
 * Egy dokumentum adatbázisból visszaadott szerkezete.
 *
 * A chunk_count a dokumentumhoz tartozó chunkok száma.
 * A chunks_with_embedding azt mutatja meg, hogy ezek közül
 * hány rendelkezik tényleges embeddingvektorral.
 */
interface DocumentListRow {
  id: string;
  original_filename: string;
  title: string | null;
  mime_type: string;
  status:
    | "uploaded"
    | "processing"
    | "completed"
    | "failed";
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  processed_at: Date | null;
  chunk_count: string;
  chunks_with_embedding: string;
}

/*
 * GET /api/documents
 *
 * Visszaadja az adatbázisban található dokumentumokat,
 * valamint a hozzájuk kapcsolódó feldolgozási adatokat.
 *
 * A dokumentum teljes szövegét szándékosan nem adjuk vissza,
 * mert a listaoldalnak erre nincs szüksége.
 */
export async function GET() {
  try {
    /*
     * A dokumentumokat a legújabb feltöltéstől
     * a legrégebbi felé rendezzük.
     *
     * A LEFT JOIN miatt azok a dokumentumok is megjelennek,
     * amelyekhez még nem tartozik chunk.
     */
    const result =
      await databasePool.query<DocumentListRow>(`
        SELECT
          document.id,
          document.original_filename,
          document.title,
          document.mime_type,
          document.status,
          document.metadata,
          document.error_message,
          document.created_at,
          document.updated_at,
          document.processed_at,

          COUNT(chunk.id)::text AS chunk_count,

          COUNT(chunk.id)
            FILTER (
              WHERE chunk.embedding IS NOT NULL
            )::text AS chunks_with_embedding

        FROM documents AS document

        LEFT JOIN document_chunks AS chunk
          ON chunk.document_id = document.id

        GROUP BY
          document.id,
          document.original_filename,
          document.title,
          document.mime_type,
          document.status,
          document.metadata,
          document.error_message,
          document.created_at,
          document.updated_at,
          document.processed_at

        ORDER BY document.created_at DESC;
      `);

    /*
     * A PostgreSQL COUNT eredménye bigint típusú,
     * amelyet a pg csomag alapértelmezetten stringként ad vissza.
     *
     * A frontend számára ezeket számmá alakítjuk.
     */
    const documents = result.rows.map((document) => ({
      id: document.id,
      originalFilename: document.original_filename,
      title: document.title,
      mimeType: document.mime_type,
      status: document.status,
      metadata: document.metadata,
      errorMessage: document.error_message,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
      processedAt: document.processed_at,
      chunkCount: Number(document.chunk_count),
      chunksWithEmbedding: Number(
        document.chunks_with_embedding
      ),
    }));

    return NextResponse.json(
      {
        success: true,
        count: documents.length,
        documents,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    /*
     * A részletes technikai hiba csak a szerver
     * termináljában jelenik meg.
     */
    console.error(
      "Document list query failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DOCUMENT_LIST_FAILED",
          message:
            "A dokumentumlista lekérése közben hiba történt.",
        },
      },
      {
        status: 500,
      }
    );
  }
}