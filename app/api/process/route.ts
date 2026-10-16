import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import {
  createTextChunks,
  DEFAULT_CHUNKING_OPTIONS,
} from "@/lib/chunking";
import { databasePool } from "@/lib/database";
import {
  createEmbeddings,
  getEmbeddingModel,
} from "@/lib/openai";

/*
 * Az endpoint Node.js futtatókörnyezetet használ.
 */
export const runtime = "nodejs";

/*
 * A kérés JSON törzsének várt szerkezete.
 */
interface ProcessDocumentRequest {
  documentId?: unknown;
}

/*
 * Az adatbázisból beolvasott dokumentum szerkezete.
 */
interface DocumentRow {
  id: string;
  original_filename: string;
  title: string | null;
  content: string;
  status: "uploaded" | "processing" | "completed" | "failed";
  metadata: Record<string, unknown>;
}

/*
 * A dokumentum feldolgozása közben keletkező hiba
 * rövid mentése az adatbázisba.
 */
async function markDocumentAsFailed(
  documentId: string,
  errorMessage: string
): Promise<void> {
  try {
    await databasePool.query(
      `
        UPDATE documents
        SET
          status = 'failed',
          error_message = $2,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [
        documentId,
        errorMessage.slice(0, 1000),
      ]
    );
  } catch (statusUpdateError) {
    console.error(
      "A dokumentum failed állapotának mentése sikertelen:",
      statusUpdateError
    );
  }
}

/*
 * Egy JavaScript számtömb átalakítása pgvector által
 * elfogadott szöveges vektorformátummá.
 *
 * Például:
 *
 * [0.12, -0.34, 0.56]
 *
 * eredménye:
 *
 * "[0.12,-0.34,0.56]"
 */
function formatVectorForPostgreSQL(
  embedding: number[]
): string {
  return `[${embedding.join(",")}]`;
}

/*
 * A chunkok és embeddingek mentése egy tranzakcióban.
 *
 * Ha bármelyik INSERT hibát ad, az összes adatbázis-módosítás
 * visszavonásra kerül.
 */
async function saveChunks(
  databaseClient: PoolClient,
  document: DocumentRow,
  chunks: ReturnType<typeof createTextChunks>,
  embeddings: number[][]
): Promise<void> {
  /*
   * Ha a dokumentumot korábban részlegesen feldolgozták,
   * töröljük a korábbi chunkokat.
   */
  await databaseClient.query(
    `
      DELETE FROM document_chunks
      WHERE document_id = $1;
    `,
    [document.id]
  );

  /*
   * Minden chunkot a hozzá tartozó embeddinggel együtt mentünk.
   */
  for (
    let chunkPosition = 0;
    chunkPosition < chunks.length;
    chunkPosition += 1
  ) {
    const chunk = chunks[chunkPosition];
    const embedding = embeddings[chunkPosition];

    /*
     * Ez elméletileg nem fordulhat elő, de külön ellenőrizzük,
     * hogy ne kerüljön hibás adat az adatbázisba.
     */
    if (!embedding) {
      throw new Error(
        `Hiányzik az embedding a(z) ${chunkPosition}. chunkhoz.`
      );
    }

    const formattedEmbedding =
      formatVectorForPostgreSQL(embedding);

    await databaseClient.query(
      `
        INSERT INTO document_chunks (
          document_id,
          chunk_index,
          content,
          character_count,
          token_count,
          metadata,
          embedding
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7::vector
        );
      `,
      [
        document.id,
        chunk.chunkIndex,
        chunk.content,
        chunk.characterCount,
        chunk.estimatedTokenCount,
        JSON.stringify({
          sourceFilename: document.original_filename,
          documentTitle: document.title,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          chunkingStrategy: "paragraph-overlap-v1",
          maximumChunkCharacters:
            DEFAULT_CHUNKING_OPTIONS.maxChunkCharacters,
          overlapCharacters:
            DEFAULT_CHUNKING_OPTIONS.overlapCharacters,
          embeddingModel: getEmbeddingModel(),
        }),
        formattedEmbedding,
      ]
    );
  }
}

/*
 * POST /api/process
 *
 * A kérés példája:
 *
 * {
 *   "documentId": "a dokumentum UUID azonosítója"
 * }
 */
export async function POST(request: Request) {
  let documentId: string | null = null;

  try {
    /*
     * A JSON kérés beolvasása.
     */
    const requestBody =
      (await request.json()) as ProcessDocumentRequest;

    /*
     * A dokumentumazonosító ellenőrzése.
     */
    if (
      typeof requestBody.documentId !== "string" ||
      requestBody.documentId.trim().length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DOCUMENT_ID_MISSING",
            message:
              "A documentId mező megadása kötelező.",
          },
        },
        {
          status: 400,
        }
      );
    }

    documentId = requestBody.documentId.trim();

    /*
     * A feldolgozandó dokumentum beolvasása.
     */
    const documentResult =
      await databasePool.query<DocumentRow>(
        `
          SELECT
            id,
            original_filename,
            title,
            content,
            status,
            metadata
          FROM documents
          WHERE id = $1;
        `,
        [documentId]
      );

    const document = documentResult.rows[0];

    /*
     * Nem létező dokumentum kezelése.
     */
    if (!document) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DOCUMENT_NOT_FOUND",
            message:
              "A megadott azonosítóval nem található dokumentum.",
          },
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Már sikeresen feldolgozott dokumentumot nem dolgozunk fel
     * automatikusan újra. Ezzel elkerüljük a fölösleges
     * OpenAI API-költséget.
     */
    if (document.status === "completed") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DOCUMENT_ALREADY_PROCESSED",
            message:
              "A dokumentum már sikeresen fel lett dolgozva.",
          },
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Folyamatban lévő dokumentumot nem indítunk el újra.
     */
    if (document.status === "processing") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DOCUMENT_PROCESSING",
            message:
              "A dokumentum feldolgozása már folyamatban van.",
          },
        },
        {
          status: 409,
        }
      );
    }

    /*
     * A dokumentum állapotát processing értékre állítjuk.
     */
    await databasePool.query(
      `
        UPDATE documents
        SET
          status = 'processing',
          error_message = NULL,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [document.id]
    );

    /*
     * Chunkok létrehozása a korábban elkészített
     * helyi chunking modul segítségével.
     */
    const chunks = createTextChunks(document.content);

    if (chunks.length === 0) {
      throw new Error(
        "A dokumentumból nem jött létre feldolgozható chunk."
      );
    }

    /*
     * A chunkok szövegének összegyűjtése.
     */
    const chunkContents = chunks.map(
      (chunk) => chunk.content
    );

    /*
     * Embeddingek létrehozása egyetlen OpenAI API-kérésben.
     */
    const embeddings =
      await createEmbeddings(chunkContents);

    /*
     * Biztonsági ellenőrzés.
     */
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `A chunkok és embeddingek száma eltér. Chunkok: ${chunks.length}, embeddingek: ${embeddings.length}.`
      );
    }

    /*
     * Kapcsolat lekérése a tranzakcióhoz.
     */
    const databaseClient =
      await databasePool.connect();

    try {
      /*
       * Tranzakció indítása.
       */
      await databaseClient.query("BEGIN");

      await saveChunks(
        databaseClient,
        document,
        chunks,
        embeddings
      );

      /*
       * A dokumentum állapotának sikeresre állítása.
       */
      await databaseClient.query(
        `
          UPDATE documents
          SET
            status = 'completed',
            processed_at = NOW(),
            updated_at = NOW(),
            error_message = NULL,
            metadata =
              metadata ||
              $2::jsonb
          WHERE id = $1;
        `,
        [
          document.id,
          JSON.stringify({
            processing: {
              chunkCount: chunks.length,
              chunkingStrategy:
                "paragraph-overlap-v1",
              embeddingModel:
                getEmbeddingModel(),
            },
          }),
        ]
      );

      /*
       * Minden művelet sikeres, ezért véglegesítjük
       * a tranzakciót.
       */
      await databaseClient.query("COMMIT");
    } catch (databaseError) {
      /*
       * Hiba esetén minden tranzakción belüli módosítást
       * visszavonunk.
       */
      await databaseClient.query("ROLLBACK");
      throw databaseError;
    } finally {
      /*
       * A kapcsolatot minden esetben visszaadjuk a poolnak.
       */
      databaseClient.release();
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "A dokumentum feldolgozása sikeresen befejeződött.",
        document: {
          id: document.id,
          originalFilename:
            document.original_filename,
          title: document.title,
          status: "completed",
        },
        processing: {
          chunkCount: chunks.length,
          embeddingCount: embeddings.length,
          embeddingModel: getEmbeddingModel(),
          chunkingOptions:
            DEFAULT_CHUNKING_OPTIONS,
        },
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Document processing failed:",
      error
    );

    /*
     * Ha már ismert a dokumentum azonosítója,
     * failed állapotot mentünk.
     */
    if (documentId) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Ismeretlen feldolgozási hiba.";

      await markDocumentAsFailed(
        documentId,
        errorMessage
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DOCUMENT_PROCESSING_FAILED",
          message:
            "A dokumentum feldolgozása közben hiba történt.",
        },
      },
      {
        status: 500,
      }
    );
  }
}