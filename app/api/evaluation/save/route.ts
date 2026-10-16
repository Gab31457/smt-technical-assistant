import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

/**
 * A fájlmentéshez Node.js futtatási környezet szükséges.
 */
export const runtime = "nodejs";

/**
 * Minden sikeres teszteredményt
 * külön JSON-fájlba ment.
 */
export async function POST(request: Request) {
  try {
    const result = await request.json();

    if (!result || typeof result !== "object") {
      return NextResponse.json(
        {
          success: false,
          message: "Nincs menthető teszteredmény.",
        },
        {
          status: 400,
        }
      );
    }

    const outputDirectory = path.join(
      process.cwd(),
      "data",
      "evaluation-results"
    );

    /**
     * A célmappa automatikus létrehozása,
     * ha még nem létezik.
     */
    await mkdir(outputDirectory, {
      recursive: true,
    });

    /**
     * A fájlnévben a kettőspontokat kötőjelre cseréljük,
     * mert Windows alatt a kettőspont nem használható.
     */
    const timestamp = new Date()
      .toISOString()
      .replaceAll(":", "-");

    const shortId = randomUUID().slice(0, 6);

    const evaluationType =
      typeof result.evaluationType === "string"
        ? result.evaluationType
        : "single-turn";

    const fileName =
      `${evaluationType}_${timestamp}_${shortId}.json`;

    const filePath = path.join(
      outputDirectory,
      fileName
    );

    const savedResult = {
      savedAt: new Date().toISOString(),
      ...result,
    };

    await writeFile(
      filePath,
      JSON.stringify(savedResult, null, 2),
      "utf-8"
    );

    return NextResponse.json({
      success: true,
      fileName,
    });
  } catch (error) {
    console.error("Eredménymentési hiba:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "A teszteredmény mentése sikertelen.",
      },
      {
        status: 500,
      }
    );
  }
}