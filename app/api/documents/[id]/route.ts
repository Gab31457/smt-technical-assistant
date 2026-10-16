import { NextResponse } from "next/server";

import { databasePool } from "@/lib/database";

/*
 * Az endpoint Node.js futtatókörnyezetben működik,
 * mert közvetlen PostgreSQL-kapcsolatot használ.
 */
export const runtime = "nodejs";

/*
 * A dinamikus útvonal paramétereinek típusa.
 *
 * A Next.js modern App Router változatában
 * a params Promise-ként érkezik.
 */
interface DocumentRouteContext {
  params: Promise<{
    id: string;
  }>;
}

/*
 * A törlés előtt lekérdezett dokumentum szerkezete.
 */
interface ExistingDocumentRow {
  id: string;
  original_filename: string;
  title: string | null;
  status:
    | "uploaded"
    | "processing"
    | "completed"
    | "failed";
}

/*
 * UUID-formátum ellenőrzése.
 *
 * Ez csak az azonosító formátumát vizsgálja.
 * A dokumentum tényleges létezését később
 * adatbázis-lekérdezéssel ellenőrizzük.
 */
function isValidUuid(value: string): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value);
}

/*
 * DELETE /api/documents/:id
 *
 * Törli a megadott dokumentumot.
 *
 * A document_chunks táblában ON DELETE CASCADE
 * kapcsolat van beállítva, ezért a dokumentum
 * törlésekor a hozzá tartozó chunkok és embeddingek
 * automatikusan törlődnek.
 */
export async function DELETE(
  request: Request,
  context: DocumentRouteContext
) {
  /*
   * A request paramétert jelenleg nem használjuk.
   * A void jelzi, hogy ez szándékos.
   */
  void request;

  try {
    /*
     * A dinamikus URL-paraméter kiolvasása.
     */
    const { id } = await context.params;
    const documentId = id.trim();

    /*
     * Üres azonosító ellenőrzése.
     */
    if (documentId.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DOCUMENT_ID_MISSING",
            message:
              "A dokumentumazonosító megadása kötelező.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * UUID-formátum ellenőrzése.
     */
    if (!isValidUuid(documentId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_DOCUMENT_ID",
            message:
              "A dokumentumazonosító formátuma érvénytelen.",
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * A dokumentum lekérdezése.
     *
     * Itt szándékosan normál idézőjeles SQL-szöveget
     * használunk, nem backtickkel határolt template stringet.
     */
    const selectDocumentQuery =
      "SELECT id, original_filename, title, status " +
      "FROM documents " +
      "WHERE id = $1;";

    const existingDocumentResult =
      await databasePool.query<ExistingDocumentRow>(
        selectDocumentQuery,
        [documentId]
      );

    const existingDocument =
      existingDocumentResult.rows[0];

    /*
     * Nem létező dokumentum kezelése.
     */
    if (!existingDocument) {
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
     * Folyamatban lévő dokumentumot nem törlünk.
     *
     * Ezzel elkerüljük, hogy az embeddinggenerálás
     * közben eltűnjön a forrásdokumentum.
     */
    if (existingDocument.status === "processing") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DOCUMENT_PROCESSING",
            message:
              "A dokumentum jelenleg feldolgozás alatt áll, ezért nem törölhető.",
          },
        },
        {
          status: 409,
        }
      );
    }

    /*
     * A dokumentum törlése.
     *
     * Az ON DELETE CASCADE kapcsolat miatt a hozzá
     * tartozó document_chunks sorok automatikusan törlődnek.
     */
    const deleteDocumentQuery =
      "DELETE FROM documents WHERE id = $1;";

    await databasePool.query(
      deleteDocumentQuery,
      [documentId]
    );

    /*
     * Sikeres válasz.
     */
    return NextResponse.json(
      {
        success: true,
        message:
          "A dokumentum és a hozzá tartozó chunkok sikeresen törölve lettek.",
        deletedDocument: {
          id: existingDocument.id,
          originalFilename:
            existingDocument.original_filename,
          title: existingDocument.title,
          previousStatus: existingDocument.status,
        },
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    /*
     * A részletes technikai hibát csak a szerver
     * termináljában jelenítjük meg.
     */
    console.error(
      "Document deletion failed:",
      error
    );

    /*
     * A kliensnek általános hibaüzenetet küldünk,
     * belső adatbázis-információk nélkül.
     */
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DOCUMENT_DELETE_FAILED",
          message:
            "A dokumentum törlése közben váratlan hiba történt.",
        },
      },
      {
        status: 500,
      }
    );
  }
}