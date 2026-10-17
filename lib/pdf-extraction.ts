/*
 * Szövegréteggel rendelkező PDF-ek oldalankénti feldolgozása.
 * OCR-t szándékosan nem használunk.
 */
export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
  characterCount: number;
}

export interface ExtractedPdfDocument {
  pageCount: number;
  pagesWithText: number;
  totalCharacterCount: number;
  content: string;
}

const PDF_PAGE_MARKER_PREFIX = "[[PDF_PAGE:";
const PDF_PAGE_MARKER_SUFFIX = "]]";

export function createPdfPageMarker(pageNumber: number): string {
  return `${PDF_PAGE_MARKER_PREFIX}${pageNumber}${PDF_PAGE_MARKER_SUFFIX}`;
}

export function parsePdfPageContent(
  content: string
): ExtractedPdfPage[] {
  const markerPattern = /\[\[PDF_PAGE:(\d+)\]\]/g;
  const matches = [...content.matchAll(markerPattern)];

  return matches
    .map((match, index) => {
      const pageNumber = Number(match[1]);
      const start = (match.index ?? 0) + match[0].length;
      const end =
        index + 1 < matches.length
          ? matches[index + 1].index
          : content.length;
      const text = content.slice(start, end).trim();

      return {
        pageNumber,
        text,
        characterCount: text.length,
      };
    })
    .filter((page) => page.text.length > 0);
}

function normalizePdfPageText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/([A-Za-z])-[ \t]*\n[ \t]*([A-Za-z])/g, "$1$2")
    .replace(/(?<![.!?:;])\n(?=[a-z])/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractTextFromPdf(
  pdfBuffer: Buffer
): Promise<ExtractedPdfDocument> {
  const pdfHeader = pdfBuffer.subarray(0, 5).toString("ascii");

  if (pdfHeader !== "%PDF-") {
    throw new Error("A feltöltött fájl nem érvényes PDF-dokumentum.");
  }

  /*
   * A modulokat natív Node.js importtal töltjük be, így a Turbopack
   * nem próbálja a PDF.js workerét a .next mappából feloldani.
   */
  const importPdfModule = new Function(
    "modulePath",
    "return import(modulePath);"
  ) as (
    modulePath: string
  ) => Promise<Record<string, unknown>>;

  const workerModule = await importPdfModule(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  );

  const WorkerMessageHandler =
    workerModule.WorkerMessageHandler;

  if (!WorkerMessageHandler) {
    throw new Error(
      "A PDF.js worker modul nem tölthető be."
    );
  }

  const globalWithPdfWorker = globalThis as typeof globalThis & {
    pdfjsWorker?: {
      WorkerMessageHandler: unknown;
    };
  };

  globalWithPdfWorker.pdfjsWorker = {
    WorkerMessageHandler,
  };

  const pdfjsModule = await importPdfModule(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );
  const getDocument = pdfjsModule.getDocument;

  if (typeof getDocument !== "function") {
    throw new Error(
      "A PDF.js dokumentumolvasó modul nem tölthető be."
    );
  }

  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });

  const pdfDocument = await loadingTask.promise;
  const pageCount = pdfDocument.numPages;
  const pages: ExtractedPdfPage[] = [];

  try {
    for (
      let pageNumber = 1;
      pageNumber <= pageCount;
      pageNumber += 1
    ) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const rawText = textContent.items
        .map((item: unknown) => {
          if (
            typeof item === "object" &&
            item !== null &&
            "str" in item &&
            typeof item.str === "string"
          ) {
            return item.str;
          }

          return "";
        })
        .join(" ");
      const text = normalizePdfPageText(rawText);

      pages.push({
        pageNumber,
        text,
        characterCount: text.length,
      });
      page.cleanup();
    }
  } finally {
    await pdfDocument.destroy();
  }

  const pagesWithText = pages.filter(
    (page) => page.characterCount >= 20
  );
  const totalCharacterCount = pagesWithText.reduce(
    (sum, page) => sum + page.characterCount,
    0
  );

  if (
    pagesWithText.length === 0 ||
    totalCharacterCount < 100
  ) {
    throw new Error(
      "A PDF nem tartalmaz elegendő kinyerhető szöveget. A szkennelt PDF-ek OCR nélkül nem dolgozhatók fel."
    );
  }

  return {
    pageCount,
    pagesWithText: pagesWithText.length,
    totalCharacterCount,
    content: pagesWithText
      .map(
        (page) =>
          `${createPdfPageMarker(page.pageNumber)}\n${page.text}`
      )
      .join("\n\n"),
  };
}
