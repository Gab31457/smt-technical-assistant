import mammoth from "mammoth";

export interface ExtractedDocxDocument {
  content: string;
  paragraphCount: number;
  warningCount: number;
}

/*
 * DOCX szövegkinyerés OCR és beágyazott objektumok futtatása nélkül.
 * A Mammoth a dokumentum szöveges, szemantikai tartalmát olvassa ki.
 */
export async function extractTextFromDocx(
  docxBuffer: Buffer
): Promise<ExtractedDocxDocument> {
  const result = await mammoth.extractRawText({
    buffer: docxBuffer,
  });

  const content = result.value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (content.length < 20) {
    throw new Error(
      "A DOCX fájlból nem nyerhető ki elegendő feldolgozható szöveg. A képekbe ágyazott szöveget OCR nélkül nem dolgozzuk fel."
    );
  }

  const paragraphCount = content
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .length;

  return {
    content,
    paragraphCount,
    warningCount: result.messages.length,
  };
}
