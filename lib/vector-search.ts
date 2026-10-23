import { databasePool } from "@/lib/database";
import { createEmbedding } from "@/lib/openai";

/*
 * A vektoros keresés beállításai.
 *
 * limit:
 *   Legfeljebb hány végső találatot kérünk vissza.
 *
 * minimumSimilarity:
 *   A minimálisan elfogadható cosine similarity.
 */
export interface VectorSearchOptions {
  limit: number;
  minimumSimilarity: number;
  documentIds: string[];
}

/*
 * Alapértelmezett keresési beállítások.
 * A végső Top K alapértelmezetten 5 találat.
 */
export const DEFAULT_VECTOR_SEARCH_OPTIONS: VectorSearchOptions = {
  limit: 5,
  minimumSimilarity: 0.2,
  documentIds: [],
};

interface VectorSearchDatabaseRow {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  chunk_content: string;
  chunk_metadata: Record<string, unknown>;
  original_filename: string;
  document_title: string | null;
  document_metadata: Record<string, unknown>;
  distance: string | number;
  similarity: string | number;
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  originalFilename: string;
  documentTitle: string | null;
  chunkMetadata: Record<string, unknown>;
  documentMetadata: Record<string, unknown>;
  sourceType: string | null;
  extractionMethod: string | null;
  pageNumber: number | null;
  worksheetName: string | null;
  rowStart: number | null;
  rowEnd: number | null;
  distance: number;
  similarity: number;
}

function readStringMetadata(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumberMetadata(
  metadata: Record<string, unknown>,
  key: string
): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function formatVectorForPostgreSQL(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function validateSearchOptions(options: VectorSearchOptions): void {
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 20
  ) {
    throw new Error(
      "A keresési limitnek 1 és 20 közötti egész számnak kell lennie."
    );
  }

  if (
    !Number.isFinite(options.minimumSimilarity) ||
    options.minimumSimilarity < -1 ||
    options.minimumSimilarity > 1
  ) {
    throw new Error(
      "A minimumSimilarity értékének -1 és 1 között kell lennie."
    );
  }
}

export async function searchSimilarChunks(
  queryText: string,
  customOptions: Partial<VectorSearchOptions> = {}
): Promise<VectorSearchResult[]> {
  const normalizedQuery = queryText.trim();

  if (normalizedQuery.length === 0) {
    throw new Error(
      "Üres keresőkérdéshez nem indítható szemantikus keresés."
    );
  }

  if (normalizedQuery.length > 2000) {
    throw new Error(
      "A keresőkérdés legfeljebb 2000 karakter hosszú lehet."
    );
  }

  const options: VectorSearchOptions = {
    ...DEFAULT_VECTOR_SEARCH_OPTIONS,
    ...customOptions,
  };

  validateSearchOptions(options);

  const documentIds = [
    ...new Set(
      options.documentIds
        .map((documentId) => documentId.trim())
        .filter((documentId) => documentId.length > 0)
    ),
  ];

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!documentIds.every((documentId) => uuidPattern.test(documentId))) {
    throw new Error(
      "Érvénytelen dokumentumazonosító a keresési szűrőben."
    );
  }

  const queryEmbedding = await createEmbedding(normalizedQuery);
  const formattedQueryEmbedding = formatVectorForPostgreSQL(queryEmbedding);

  const documentFilter =
    documentIds.length > 0
      ? "AND document.id = ANY($3::uuid[]) "
      : "";

  const limitParameter = documentIds.length > 0 ? "$4" : "$3";

  const vectorSearchQuery =
    "SELECT " +
    "chunk.id AS chunk_id, " +
    "chunk.document_id, " +
    "chunk.chunk_index, " +
    "chunk.content AS chunk_content, " +
    "chunk.metadata AS chunk_metadata, " +
    "document.original_filename, " +
    "document.title AS document_title, " +
    "document.metadata AS document_metadata, " +
    "chunk.embedding <=> $1::vector AS distance, " +
    "1 - (chunk.embedding <=> $1::vector) AS similarity " +
    "FROM document_chunks AS chunk " +
    "INNER JOIN documents AS document " +
    "ON document.id = chunk.document_id " +
    "WHERE chunk.embedding IS NOT NULL " +
    "AND document.status = 'completed' " +
    documentFilter +
    "AND 1 - (chunk.embedding <=> $1::vector) >= $2 " +
    "ORDER BY chunk.embedding <=> $1::vector ASC " +
    `LIMIT ${limitParameter};`;

  const queryParameters =
    documentIds.length > 0
      ? [
          formattedQueryEmbedding,
          options.minimumSimilarity,
          documentIds,
          options.limit,
        ]
      : [
          formattedQueryEmbedding,
          options.minimumSimilarity,
          options.limit,
        ];

  const result = await databasePool.query<VectorSearchDatabaseRow>(
    vectorSearchQuery,
    queryParameters
  );

  return result.rows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    content: row.chunk_content,
    originalFilename: row.original_filename,
    documentTitle: row.document_title,
    chunkMetadata: row.chunk_metadata,
    documentMetadata: row.document_metadata,
    sourceType: readStringMetadata(row.chunk_metadata, "sourceType"),
    extractionMethod: readStringMetadata(
      row.chunk_metadata,
      "extractionMethod"
    ),
    pageNumber: readNumberMetadata(row.chunk_metadata, "pageNumber"),
    worksheetName: readStringMetadata(
      row.chunk_metadata,
      "worksheetName"
    ),
    rowStart: readNumberMetadata(row.chunk_metadata, "rowStart"),
    rowEnd: readNumberMetadata(row.chunk_metadata, "rowEnd"),
    distance: Number(row.distance),
    similarity: Number(row.similarity),
  }));
}

export interface SearchQueryDebugResult {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  originalFilename: string;
  chunkIndex: number;
  similarity: number;
  pageNumber: number | null;
  worksheetName: string | null;
  rowStart: number | null;
  rowEnd: number | null;
}

export interface SearchQueryDebugGroup {
  query: string;
  results: SearchQueryDebugResult[];
}

export interface MultiQuerySearchResponse {
  results: VectorSearchResult[];
  debugGroups: SearchQueryDebugGroup[];
}

export async function searchSimilarChunksForQueriesWithDebug(
  queryTexts: string[],
  customOptions: Partial<VectorSearchOptions> = {}
): Promise<MultiQuerySearchResponse> {
  const uniqueQueries = [
    ...new Set(
      queryTexts
        .map((queryText) => queryText.trim())
        .filter((queryText) => queryText.length > 0)
    ),
  ];

  if (uniqueQueries.length === 0) {
    throw new Error("Legalább egy keresőkérdés megadása kötelező.");
  }

  const requestedLimit =
    customOptions.limit ?? DEFAULT_VECTOR_SEARCH_OPTIONS.limit;

  /*
   * Minden lekérdezés legalább 15 belső jelöltet kér le.
   * A felső korlát 20 marad, mert a keresési limit validációja
   * jelenleg legfeljebb 20 találatot enged.
   */
  const candidateLimit = Math.min(
    20,
    Math.max(15, requestedLimit * 4)
  );

  const searchResultGroups = await Promise.all(
    uniqueQueries.map((queryText) =>
      searchSimilarChunks(queryText, {
        ...customOptions,
        limit: candidateLimit,
      })
    )
  );

  interface FusedSearchResult {
    result: VectorSearchResult;
    fusionScore: number;
    bestRank: number;
    queryMatches: number;
  }

  /*
   * A Map kulcsa a chunkazonosító, ezért ugyanaz a chunk
   * csak egyszer kerülhet az összevont jelöltlistába.
   */
  const fusedResults = new Map<string, FusedSearchResult>();
  const reciprocalRankConstant = 20;

  searchResultGroups.forEach((searchResults) => {
    searchResults.forEach((searchResult, resultIndex) => {
      const rank = resultIndex + 1;
      const rankScore = 1 / (reciprocalRankConstant + rank);
      const similarityBonus =
        Math.max(0, searchResult.similarity) * 0.02;
      const contribution = rankScore + similarityBonus;
      const existing = fusedResults.get(searchResult.chunkId);

      if (!existing) {
        fusedResults.set(searchResult.chunkId, {
          result: searchResult,
          fusionScore: contribution,
          bestRank: rank,
          queryMatches: 1,
        });
        return;
      }

      /*
       * Ha ugyanaz a chunk több keresőkérdésben is megjelenik,
       * nem adjuk össze a pontszámait. Az összegzés az általános,
       * több lekérdezésben közepesen szereplő chunkokat indokolatlanul
       * a specifikus, egy keresésben erős találatok elé helyezné.
       */
      existing.fusionScore = Math.max(
        existing.fusionScore,
        contribution
      );
      existing.bestRank = Math.min(existing.bestRank, rank);
      existing.queryMatches += 1;

      if (searchResult.similarity > existing.result.similarity) {
        existing.result = searchResult;
      }
    });
  });

  const rankedResults = [...fusedResults.values()]
    .sort((firstResult, secondResult) => {
      if (secondResult.fusionScore !== firstResult.fusionScore) {
        return secondResult.fusionScore - firstResult.fusionScore;
      }

      if (firstResult.bestRank !== secondResult.bestRank) {
        return firstResult.bestRank - secondResult.bestRank;
      }

      return (
        secondResult.result.similarity -
        firstResult.result.similarity
      );
    })
    .map((fusedResult) => fusedResult.result);

  /*
   * Nincs keresőkérdésenként garantált első találat.
   * A végső listát kizárólag az összevont rangsor tölti fel.
   */
  const selectedResults: VectorSearchResult[] = [];
  const selectedChunkIds = new Set<string>();

  /*
   * Több dokumentumos keresésnél dokumentumonként legfeljebb
   * három chunk kerülhet a végső listába. Egyetlen kijelölt
   * dokumentumnál a teljes kért keretet használhatja ugyanaz
   * a dokumentum.
   */
  const selectedDocumentFilter = [
    ...new Set(
      (
        customOptions.documentIds ??
        DEFAULT_VECTOR_SEARCH_OPTIONS.documentIds
      )
        .map((documentId) => documentId.trim())
        .filter((documentId) => documentId.length > 0)
    ),
  ];

  const maximumChunksPerDocument =
    selectedDocumentFilter.length === 1 ? requestedLimit : 3;

  const documentCounts = new Map<string, number>();

  for (const rankedResult of rankedResults) {
    if (selectedResults.length >= requestedLimit) {
      break;
    }

    if (selectedChunkIds.has(rankedResult.chunkId)) {
      continue;
    }

    const documentCount =
      documentCounts.get(rankedResult.documentId) ?? 0;

    if (documentCount >= maximumChunksPerDocument) {
      continue;
    }

    selectedResults.push(rankedResult);
    selectedChunkIds.add(rankedResult.chunkId);
    documentCounts.set(
      rankedResult.documentId,
      documentCount + 1
    );
  }

  const finalResults = selectedResults.slice(0, requestedLimit);

  const debugGroups: SearchQueryDebugGroup[] = uniqueQueries.map(
    (query, queryIndex) => ({
      query,
      results: (searchResultGroups[queryIndex] ?? [])
        .slice(0, 5)
        .map((result) => ({
          chunkId: result.chunkId,
          documentId: result.documentId,
          documentTitle: result.documentTitle,
          originalFilename: result.originalFilename,
          chunkIndex: result.chunkIndex,
          similarity: result.similarity,
          pageNumber: result.pageNumber,
          worksheetName: result.worksheetName,
          rowStart: result.rowStart,
          rowEnd: result.rowEnd,
        })),
    })
  );

  return {
    results: finalResults,
    debugGroups,
  };
}

export async function searchSimilarChunksForQueries(
  queryTexts: string[],
  customOptions: Partial<VectorSearchOptions> = {}
): Promise<VectorSearchResult[]> {
  const response = await searchSimilarChunksForQueriesWithDebug(
    queryTexts,
    customOptions
  );

  return response.results;
}
