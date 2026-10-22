import { NextResponse } from "next/server";

import { databasePool } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DocumentChunkRow {
  document_id: string;
  original_filename: string;
  document_title: string | null;
  document_status: string;
  chunk_id: string;
  chunk_index: number;
  content: string;
  has_embedding: boolean;
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const documentId =
      searchParams.get("documentId")?.trim() || null;
    const filename =
      searchParams.get("filename")?.trim() || null;
    const query =
      searchParams.get("query")?.trim() || null;
    const requestedLimit = Number(
      searchParams.get("limit") ?? "500"
    );
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(
          2000,
          Math.max(1, Math.trunc(requestedLimit))
        )
      : 500;

    const result =
      await databasePool.query<DocumentChunkRow>(
        `
          SELECT
            document.id AS document_id,
            document.original_filename,
            document.title AS document_title,
            document.status AS document_status,
            chunk.id AS chunk_id,
            chunk.chunk_index,
            chunk.content,
            (chunk.embedding IS NOT NULL) AS has_embedding
          FROM documents AS document
          INNER JOIN document_chunks AS chunk
            ON chunk.document_id = document.id
          WHERE
            ($1::uuid IS NULL OR document.id = $1::uuid)
            AND (
              $2::text IS NULL
              OR document.original_filename
                ILIKE '%' || $2::text || '%'
            )
            AND (
              $3::text IS NULL
              OR chunk.content ILIKE '%' || $3::text || '%'
            )
          ORDER BY
            document.original_filename ASC,
            chunk.chunk_index ASC
          LIMIT $4
        `,
        [documentId, filename, query, limit]
      );

    const documents = new Map<
      string,
      {
        documentId: string;
        originalFilename: string;
        documentTitle: string | null;
        status: string;
        chunks: Array<{
          chunkId: string;
          chunkIndex: number;
          content: string;
          hasEmbedding: boolean;
        }>;
      }
    >();

    for (const row of result.rows) {
      const chunk = {
        chunkId: row.chunk_id,
        chunkIndex: row.chunk_index,
        content: row.content,
        hasEmbedding: row.has_embedding,
      };
      const existingDocument = documents.get(
        row.document_id
      );

      if (existingDocument) {
        existingDocument.chunks.push(chunk);
        continue;
      }

      documents.set(row.document_id, {
        documentId: row.document_id,
        originalFilename: row.original_filename,
        documentTitle: row.document_title,
        status: row.document_status,
        chunks: [chunk],
      });
    }

    return NextResponse.json({
      success: true,
      filters: {
        documentId,
        filename,
        query,
        limit,
      },
      documentCount: documents.size,
      chunkCount: result.rows.length,
      documents: [...documents.values()],
    });
  } catch (error) {
    console.error("Document chunk export failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DOCUMENT_CHUNK_EXPORT_FAILED",
          message:
            "A dokumentumchunkok lekérése közben hiba történt.",
        },
      },
      { status: 500 }
    );
  }
}
