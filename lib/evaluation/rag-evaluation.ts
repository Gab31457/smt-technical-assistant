export interface RagSource {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
  content?: string;
  sourceType?: string | null;
  extractionMethod?: string | null;
  pageNumber?: number | null;
  worksheetName?: string | null;
  rowStart?: number | null;
  rowEnd?: number | null;
}

export interface RagCheckResult {
  hasResults: boolean;
  hasContext: boolean;
  expectedSourceFound: boolean;
  similarityPassed: boolean;
  bestSimilarity: number;
  passed: boolean;
  explanation: string;
}

interface RagCheckInput {
  sources: RagSource[];
  resultCount: number;
  contextCount: number;
  expectedSource: string;
  minimumSimilarity: number;
}

// Egyszerű, szabályalapú RAG-ellenőrzést végez.
export function evaluateRagResult({
  sources,
  resultCount,
  contextCount,
  expectedSource,
  minimumSimilarity,
}: RagCheckInput): RagCheckResult {
  const normalizedExpectedSource =
    expectedSource.trim().toLowerCase();

  const hasResults = resultCount > 0;
  const hasContext = contextCount > 0;

  const bestSimilarity =
    sources.length > 0
      ? Math.max(
          ...sources.map((source) => source.similarity)
        )
      : 0;

  const expectedSourceFound =
    normalizedExpectedSource.length === 0
      ? true
      : sources.some((source) => {
          const title = (
            source.documentTitle || ""
          ).toLowerCase();

          const filename =
            source.originalFilename.toLowerCase();

          return (
            title.includes(normalizedExpectedSource) ||
            filename.includes(normalizedExpectedSource)
          );
        });

  const similarityPassed =
    bestSimilarity >= minimumSimilarity;

  const passed =
    hasResults &&
    hasContext &&
    expectedSourceFound &&
    similarityPassed;

  const explanation = createExplanation({
    hasResults,
    hasContext,
    expectedSourceFound,
    similarityPassed,
    bestSimilarity,
    minimumSimilarity,
    expectedSource: normalizedExpectedSource,
  });

  return {
    hasResults,
    hasContext,
    expectedSourceFound,
    similarityPassed,
    bestSimilarity,
    passed,
    explanation,
  };
}

// Rövid magyar magyarázatot készít az eredményhez.
function createExplanation({
  hasResults,
  hasContext,
  expectedSourceFound,
  similarityPassed,
  bestSimilarity,
  minimumSimilarity,
  expectedSource,
}: {
  hasResults: boolean;
  hasContext: boolean;
  expectedSourceFound: boolean;
  similarityPassed: boolean;
  bestSimilarity: number;
  minimumSimilarity: number;
  expectedSource: string;
}) {
  const messages: string[] = [];

  if (hasResults) {
    messages.push("A keresés adott találatot.");
  } else {
    messages.push("A keresés nem adott találatot.");
  }

  if (hasContext) {
    messages.push(
      "A válaszgenerálás kapott RAG-kontextust."
    );
  } else {
    messages.push(
      "A válaszgenerálás nem kapott RAG-kontextust."
    );
  }

  if (expectedSource) {
    if (expectedSourceFound) {
      messages.push(
        "Az elvárt dokumentum szerepel a források között."
      );
    } else {
      messages.push(
        "Az elvárt dokumentum nem szerepel a források között."
      );
    }
  }

  if (similarityPassed) {
    messages.push(
      `A legjobb hasonlóság ${bestSimilarity.toFixed(3)}, ` +
        `ami eléri a ${minimumSimilarity.toFixed(3)} küszöböt.`
    );
  } else {
    messages.push(
      `A legjobb hasonlóság ${bestSimilarity.toFixed(3)}, ` +
        `ami nem éri el a ${minimumSimilarity.toFixed(3)} küszöböt.`
    );
  }

  return messages.join(" ");
}