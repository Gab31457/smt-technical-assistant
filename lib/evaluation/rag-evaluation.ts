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

export interface RagRetrievalMetrics {
  topK: number;
  evaluatedResultCount: number;
  relevantRetrievedCount: number;
  totalRelevantCount: number;
  precisionAtK: number;
  recallAtK: number;
  meanReciprocalRank: number;
  firstRelevantRank: number | null;
}

export interface RagCheckResult {
  hasResults: boolean;
  hasContext: boolean;
  expectedSourceFound: boolean;
  similarityPassed: boolean;
  bestSimilarity: number;
  retrievalMetrics: RagRetrievalMetrics;
  passed: boolean;
  explanation: string;
}

interface RagCheckInput {
  sources: RagSource[];
  resultCount: number;
  contextCount: number;
  expectedSource: string;
  minimumSimilarity: number;
  topK?: number;
  expectedDocumentIds?: string[];
  relevantChunkIndexes?: number[];
}

function normalizeStringValues(values: string[] = []): string[] {
  return [...new Set(
    values
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  )];
}

function normalizeChunkIndexes(values: number[] = []): number[] {
  return [...new Set(
    values.filter(
      (value) => Number.isInteger(value) && value >= 0
    )
  )];
}

function isRelevantSource(
  source: RagSource,
  expectedDocumentIds: string[],
  relevantChunkIndexes: number[],
  normalizedExpectedSource: string
): boolean {
  const documentMatches =
    expectedDocumentIds.length === 0
      ? true
      : expectedDocumentIds.includes(source.documentId);
  const chunkMatches =
    relevantChunkIndexes.length === 0
      ? true
      : relevantChunkIndexes.includes(source.chunkIndex);
  const legacySourceMatches =
    normalizedExpectedSource.length === 0
      ? true
      : (source.documentTitle ?? "")
          .toLowerCase()
          .includes(normalizedExpectedSource) ||
        source.originalFilename
          .toLowerCase()
          .includes(normalizedExpectedSource);

  return documentMatches && chunkMatches && legacySourceMatches;
}

export function calculateRetrievalMetrics({
  sources,
  topK,
  expectedDocumentIds = [],
  relevantChunkIndexes = [],
  expectedSource = "",
}: {
  sources: RagSource[];
  topK: number;
  expectedDocumentIds?: string[];
  relevantChunkIndexes?: number[];
  expectedSource?: string;
}): RagRetrievalMetrics {
  const normalizedTopK = Number.isInteger(topK)
    ? Math.min(20, Math.max(1, topK))
    : 5;
  const normalizedDocumentIds =
    normalizeStringValues(expectedDocumentIds);
  const normalizedChunkIndexes =
    normalizeChunkIndexes(relevantChunkIndexes);
  const normalizedExpectedSource =
    expectedSource.trim().toLowerCase();
  const evaluatedSources = sources.slice(0, normalizedTopK);
  const relevantFlags = evaluatedSources.map((source) =>
    isRelevantSource(
      source,
      normalizedDocumentIds,
      normalizedChunkIndexes,
      normalizedExpectedSource
    )
  );
  const relevantRetrievedCount =
    relevantFlags.filter(Boolean).length;
  const firstRelevantIndex = relevantFlags.findIndex(Boolean);
  const firstRelevantRank =
    firstRelevantIndex >= 0
      ? firstRelevantIndex + 1
      : null;

  const explicitRelevantChunkCount =
    normalizedChunkIndexes.length;
  const explicitRelevantDocumentCount =
    normalizedDocumentIds.length;
  const totalRelevantCount =
    explicitRelevantChunkCount > 0
      ? explicitRelevantChunkCount
      : explicitRelevantDocumentCount > 0
        ? explicitRelevantDocumentCount
        : normalizedExpectedSource.length > 0
          ? 1
          : 0;

  return {
    topK: normalizedTopK,
    evaluatedResultCount: evaluatedSources.length,
    relevantRetrievedCount,
    totalRelevantCount,
    precisionAtK:
      evaluatedSources.length > 0
        ? relevantRetrievedCount / evaluatedSources.length
        : 0,
    recallAtK:
      totalRelevantCount > 0
        ? Math.min(
            1,
            relevantRetrievedCount / totalRelevantCount
          )
        : 0,
    meanReciprocalRank:
      firstRelevantRank === null
        ? 0
        : 1 / firstRelevantRank,
    firstRelevantRank,
  };
}

// Szabályalapú RAG-ellenőrzés és determinisztikus retrieval metrikák.
export function evaluateRagResult({
  sources,
  resultCount,
  contextCount,
  expectedSource,
  minimumSimilarity,
  topK = 5,
  expectedDocumentIds = [],
  relevantChunkIndexes = [],
}: RagCheckInput): RagCheckResult {
  const normalizedExpectedSource =
    expectedSource.trim().toLowerCase();
  const normalizedDocumentIds =
    normalizeStringValues(expectedDocumentIds);
  const hasResults = resultCount > 0;
  const hasContext = contextCount > 0;
  const bestSimilarity =
    sources.length > 0
      ? Math.max(...sources.map((source) => source.similarity))
      : 0;
  const expectedSourceFound =
    normalizedDocumentIds.length === 0 &&
    normalizedExpectedSource.length === 0
      ? true
      : sources.some((source) => {
          const idMatches =
            normalizedDocumentIds.length === 0 ||
            normalizedDocumentIds.includes(source.documentId);
          const nameMatches =
            normalizedExpectedSource.length === 0 ||
            (source.documentTitle ?? "")
              .toLowerCase()
              .includes(normalizedExpectedSource) ||
            source.originalFilename
              .toLowerCase()
              .includes(normalizedExpectedSource);

          return idMatches && nameMatches;
        });
  const similarityPassed =
    bestSimilarity >= minimumSimilarity;
  const retrievalMetrics = calculateRetrievalMetrics({
    sources,
    topK,
    expectedDocumentIds: normalizedDocumentIds,
    relevantChunkIndexes,
    expectedSource: normalizedExpectedSource,
  });
  const hasExplicitRelevanceDefinition =
    normalizedDocumentIds.length > 0 ||
    normalizeChunkIndexes(relevantChunkIndexes).length > 0 ||
    normalizedExpectedSource.length > 0;
  const retrievalPassed =
    !hasExplicitRelevanceDefinition ||
    retrievalMetrics.firstRelevantRank !== null;
  const passed =
    hasResults &&
    hasContext &&
    expectedSourceFound &&
    similarityPassed &&
    retrievalPassed;
  const explanation = createExplanation({
    hasResults,
    hasContext,
    expectedSourceFound,
    similarityPassed,
    bestSimilarity,
    minimumSimilarity,
    expectedSource: normalizedExpectedSource,
    retrievalMetrics,
    hasExplicitRelevanceDefinition,
  });

  return {
    hasResults,
    hasContext,
    expectedSourceFound,
    similarityPassed,
    bestSimilarity,
    retrievalMetrics,
    passed,
    explanation,
  };
}

function createExplanation({
  hasResults,
  hasContext,
  expectedSourceFound,
  similarityPassed,
  bestSimilarity,
  minimumSimilarity,
  expectedSource,
  retrievalMetrics,
  hasExplicitRelevanceDefinition,
}: {
  hasResults: boolean;
  hasContext: boolean;
  expectedSourceFound: boolean;
  similarityPassed: boolean;
  bestSimilarity: number;
  minimumSimilarity: number;
  expectedSource: string;
  retrievalMetrics: RagRetrievalMetrics;
  hasExplicitRelevanceDefinition: boolean;
}): string {
  const messages: string[] = [];

  messages.push(
    hasResults
      ? "A keresés adott találatot."
      : "A keresés nem adott találatot."
  );
  messages.push(
    hasContext
      ? "A válaszgenerálás kapott RAG-kontextust."
      : "A válaszgenerálás nem kapott RAG-kontextust."
  );

  if (expectedSource) {
    messages.push(
      expectedSourceFound
        ? "Az elvárt dokumentum szerepel a források között."
        : "Az elvárt dokumentum nem szerepel a források között."
    );
  }

  messages.push(
    similarityPassed
      ? `A legjobb hasonlóság ${bestSimilarity.toFixed(3)}, ami eléri a ${minimumSimilarity.toFixed(3)} küszöböt.`
      : `A legjobb hasonlóság ${bestSimilarity.toFixed(3)}, ami nem éri el a ${minimumSimilarity.toFixed(3)} küszöböt.`
  );

  if (hasExplicitRelevanceDefinition) {
    messages.push(
      retrievalMetrics.firstRelevantRank === null
        ? `A top ${retrievalMetrics.topK} találat között nincs releváns eredmény.`
        : `Az első releváns találat helyezése: ${retrievalMetrics.firstRelevantRank}.`
    );
    messages.push(
      `Precision@${retrievalMetrics.topK}: ${retrievalMetrics.precisionAtK.toFixed(3)}, ` +
        `Recall@${retrievalMetrics.topK}: ${retrievalMetrics.recallAtK.toFixed(3)}, ` +
        `MRR: ${retrievalMetrics.meanReciprocalRank.toFixed(3)}.`
    );
  }

  return messages.join(" ");
}
