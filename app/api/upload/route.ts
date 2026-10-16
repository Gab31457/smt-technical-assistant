import { createHash } from "node:crypto";
import path from "node:path";

import { NextResponse } from "next/server";
import type { DatabaseError } from "pg";

import { databasePool } from "@/lib/database";

/*
 * Ez az API-végpont Node.js futtatókörnyezetet igényel.
 *
 * A fájl feldolgozásához a Node.js crypto és path moduljait,
 * az adatbázishoz pedig a pg csomagot használjuk.
 */
export const runtime = "nodejs";

/*
 * A támogatott fájlkiterjesztések.
 *
 * A jelenlegi verzió TXT és Markdown formátumú
 * műszaki dokumentumokat kezel.
 */
const ALLOWED_FILE_EXTENSIONS = new Set([".txt", ".md"]);

/*
 * A támogatott MIME-típusok.
 *
 * Bizonyos kliensek a Markdown fájlhoz text/markdown,
 * más kliensek text/plain MIME-típust küldhetnek.
 *
 * A curl vagy egyes böngészők néha üres MIME-típust
 * is küldhetnek, ezért a fájlkiterjesztést külön is ellenőrizzük.
 */
const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "",
]);

/*
 * A maximálisan feltölthető fájlméret.
 *
 * Ebben az első verzióban 1 MB-os korlátot használunk.
 * Szöveges műszaki dokumentumokhoz ez megfelelő, és megakadályozza,
 * hogy véletlenül nagyon nagy fájl kerüljön a memóriába.
 */
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024;

/*
 * Az INSERT lekérdezés által visszaadott adatbázissor típusa.
 */
interface CreatedDocumentRow {
  id: string;
  original_filename: string;
  title: string | null;
  mime_type: string;
  status: "uploaded" | "processing" | "completed" | "failed";
  created_at: Date;
}

/*
 * POST /api/upload
 *
 * A kérés multipart/form-data formátumú.
 * A feltöltött fájlt a "file" mezőben várjuk.
 *
 * Példa:
 *
 * formData.append("file", selectedFile);
 */
export async function POST(request: Request) {
  try {
    /*
     * A multipart/form-data kérés feldolgozása.
     *
     * A formData() metódus Promise-t ad vissza,
     * ezért await szükséges.
     */
    const formData = await request.formData();

    /*
     * A fájlt a "file" nevű mezőből olvassuk ki.
     */
    const uploadedValue = formData.get("file");

    /*
     * Ellenőrizzük, hogy a mező valóban fájlt tartalmaz-e.
     */
    if (!(uploadedValue instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FILE_MISSING",
            message:
              'Nem érkezett feltöltendő fájl. A fájlt a "file" mezőben kell elküldeni.',
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Eltávolítjuk az esetleges elérési út részeket,
     * és csak a fájl tényleges nevét tartjuk meg.
     *
     * Ez biztonsági szempontból is fontos.
     */
    const safeOriginalFilename = path.basename(uploadedValue.name);

    /*
     * Kisbetűsen kérjük le a fájl kiterjesztését.
     *
     * Például:
     * "smt_gepkonyv.TXT" -> ".txt"
     */
    const fileExtension = path
      .extname(safeOriginalFilename)
      .toLowerCase();

    /*
     * Fájlkiterjesztés ellenőrzése.
     */
    if (!ALLOWED_FILE_EXTENSIONS.has(fileExtension)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_FILE_EXTENSION",
            message:
              "Nem támogatott fájlkiterjesztés. Csak .txt és .md fájl tölthető fel.",
            receivedExtension: fileExtension || "nincs kiterjesztés",
          },
        },
        {
          status: 415,
        }
      );
    }

    /*
     * MIME-típus ellenőrzése.
     *
     * A kiterjesztés és a MIME-típus együttes ellenőrzése
     * csökkenti annak esélyét, hogy nem szöveges fájlt
     * próbáljanak szövegfájlként feltölteni.
     */
    if (!ALLOWED_MIME_TYPES.has(uploadedValue.type)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_MIME_TYPE",
            message:
              "A fájl tartalomtípusa nem támogatott. Csak egyszerű szöveges vagy Markdown fájl tölthető fel.",
            receivedMimeType: uploadedValue.type,
          },
        },
        {
          status: 415,
        }
      );
    }

    /*
     * Fájlméret ellenőrzése.
     */
    if (uploadedValue.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FILE_TOO_LARGE",
            message: "A fájl túl nagy. A maximális méret 1 MB.",
            maximumSizeBytes: MAX_FILE_SIZE_BYTES,
            receivedSizeBytes: uploadedValue.size,
          },
        },
        {
          status: 413,
        }
      );
    }

    /*
     * A fájl bájtjainak beolvasása.
     */
    const fileArrayBuffer = await uploadedValue.arrayBuffer();
    const fileBuffer = Buffer.from(fileArrayBuffer);

    /*
     * UTF-8 szöveggé alakítás.
     *
     * A fatal: true beállítás miatt érvénytelen UTF-8 tartalomnál
     * hibát kapunk, nem pedig hibás helyettesítő karaktereket.
     */
    let fileContent: string;

    try {
      const textDecoder = new TextDecoder("utf-8", {
        fatal: true,
      });

      fileContent = textDecoder.decode(fileBuffer);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TEXT_ENCODING",
            message:
              "A fájl nem olvasható érvényes UTF-8 szövegként. Kérlek, mentsd UTF-8 kódolással.",
          },
        },
        {
          status: 422,
        }
      );
    }

    /*
     * Üres vagy csak szóközöket tartalmazó fájl elutasítása.
     */
    if (fileContent.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EMPTY_FILE",
            message: "Az üres fájl nem tölthető fel.",
          },
        },
        {
          status: 422,
        }
      );
    }

    /*
     * SHA-256 hash készítése a fájl tartalmából.
     *
     * A hash segítségével azonosíthatjuk az azonos tartalmú,
     * többször feltöltött dokumentumokat.
     */
    const contentHash = createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

    /*
     * A cím kezdetben a fájlnév kiterjesztés nélküli része.
     *
     * Példa:
     * "smt_gepkonyv.md" -> "smt_gepkonyv"
     *
     * Később a dokumentumfeldolgozás során pontosabb
     * dokumentumcímet is kinyerhetünk a tartalomból.
     */
    const initialTitle = path.basename(
      safeOriginalFilename,
      fileExtension
    );

    /*
     * Ha a kliens nem küldött MIME-típust, a kiterjesztés
     * alapján adunk meg egy biztonságos alapértelmezett értéket.
     */
    const normalizedMimeType =
      uploadedValue.type ||
      (fileExtension === ".md" ? "text/markdown" : "text/plain");

    /*
     * A dokumentum mentése paraméterezett SQL-lekérdezéssel.
     *
     * A $1, $2 stb. helyőrzők megakadályozzák, hogy a feltöltött
     * fájlnév vagy tartalom SQL-kódként értelmeződjön.
     */
    const result = await databasePool.query<CreatedDocumentRow>(
      `
        INSERT INTO documents (
          original_filename,
          title,
          mime_type,
          content,
          content_hash,
          status,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'uploaded',
          $6::jsonb
        )
        RETURNING
          id,
          original_filename,
          title,
          mime_type,
          status,
          created_at;
      `,
      [
        safeOriginalFilename,
        initialTitle,
        normalizedMimeType,
        fileContent,
        contentHash,
        JSON.stringify({
          source: "file_upload",
          fileExtension,
          fileSizeBytes: uploadedValue.size,
        }),
      ]
    );

    /*
     * Az INSERT egyetlen dokumentumot hoz létre.
     */
    const createdDocument = result.rows[0];

    /*
     * A 201 Created státuszkód azt jelenti,
     * hogy új erőforrás jött létre.
     */
    return NextResponse.json(
      {
        success: true,
        message: "A dokumentum feltöltése sikeres.",
        document: {
          id: createdDocument.id,
          originalFilename: createdDocument.original_filename,
          title: createdDocument.title,
          mimeType: createdDocument.mime_type,
          status: createdDocument.status,
          createdAt: createdDocument.created_at,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    /*
     * A PostgreSQL 23505 hibakódja egyedi kulcs
     * megsértését jelenti.
     *
     * A documents táblában a content_hash egyedi,
     * ezért ez azt jelenti, hogy ugyanazt a tartalmat
     * már korábban feltöltötték.
     */
    const databaseError = error as DatabaseError;

    if (
      databaseError.code === "23505" &&
      databaseError.constraint ===
        "documents_content_hash_unique_index"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DUPLICATE_DOCUMENT",
            message:
              "Ez a dokumentum már szerepel az adatbázisban.",
          },
        },
        {
          status: 409,
        }
      );
    }

    /*
     * A részletes hibát csak a szerver termináljába írjuk ki.
     */
    console.error("Document upload failed:", error);

    /*
     * A kliensnek általános hibaüzenetet küldünk,
     * érzékeny adatbázis-információ nélkül.
     */
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DOCUMENT_UPLOAD_FAILED",
          message:
            "A dokumentum feltöltése közben váratlan hiba történt.",
        },
      },
      {
        status: 500,
      }
    );
  }
}


