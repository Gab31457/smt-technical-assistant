import { databasePool } from "@/lib/database";
import { createEmbedding } from "@/lib/openai";

/*
 * A vektoros keresés beállításai.
 *
 * limit:
 *   Legfeljebb hány találatot kérünk vissza.
 *
 * minimumSimilarity:
 *   A minimálisan elfogadható cosine similarity.
 *
 * A similarity értéke elméletileg -1 és 1 között lehet.
 * A gyakorlatban a szemantikailag kapcsolódó szövegek
 * általában pozitív értéket adnak.
 */
export interface VectorSearchOptions {
  limit: number;
  minimumSimilarity: number;
  documentIds: string[];
}

/*
 * Alapértelmezett keresési beállítások.
 *
 * Első körben maximum öt találatot kérünk vissza.
 *
 * Ez az alapérték fejlesztéshez és teszteléshez használható.
 * Később valós SMT műszaki dokumentumokkal és evaluációval
 * pontosítható.
 * 
 */
export const DEFAULT_VECTOR_SEARCH_OPTIONS:
  VectorSearchOptions = {
    limit: 5,
    minimumSimilarity: 0.2,
    documentIds: [],
  };

/*
 * A PostgreSQL lekérdezés által visszaadott sor típusa.
 *
 * A pg csomag bizonyos numerikus PostgreSQL-típusokat
 * szövegként is visszaadhat, ezért a distance és similarity
 * mezők típusa string vagy number lehet.
 */
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

/*
 * A backend többi része számára visszaadott,
 * könnyebben használható találati struktúra.
 */
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

/*
 * Egy JavaScript számtömb átalakítása a pgvector
 * által elfogadott szöveges vektorformátummá.
 *
 * Példa:
 *
 * [0.12, -0.34, 0.56]
 *
 * eredménye:
 *
 * [0.12,-0.34,0.56]
 */
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

function formatVectorForPostgreSQL(
  embedding: number[]
): string {
  return `[${embedding.join(",")}]`;
}

/*
 * A keresési beállítások ellenőrzése.
 *
 * Ezzel elkerüljük például a negatív találatszámot
 * vagy az érvénytelen similarity küszöböt.
 */
function validateSearchOptions(
  options: VectorSearchOptions
): void {
  /*
   * A limitnek pozitív egész számnak kell lennie.
   */
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 20
  ) {
    throw new Error(
      "A keresési limitnek 1 és 20 közötti egész számnak kell lennie."
    );
  }

  /*
   * A cosine similarity elméleti tartománya
   * -1 és 1 között van.
   */
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

/*
 * Szemantikus keresés végrehajtása.
 *
 * A folyamat:
 *
 * 1. ellenőrzi a kérdést;
 * 2. embeddinget készít a kérdésből;
 * 3. pgvector cosine distance keresést futtat;
 * 4. kiszámítja a cosine similarity értéket;
 * 5. csak a minimum küszöböt elérő találatokat adja vissza.
 */
export async function searchSimilarChunks(
  queryText: string,
  customOptions: Partial<VectorSearchOptions> = {}
): Promise<VectorSearchResult[]> {
  /*
   * A kérdés normalizálása.
   */
  const normalizedQuery = queryText.trim();

  /*
   * Üres kérdéshez nem indítunk embedding API-hívást.
   */
  if (normalizedQuery.length === 0) {
    throw new Error(
      "Üres keresőkérdéshez nem indítható szemantikus keresés."
    );
  }

  /*
   * A túl hosszú keresőkérdéseket elutasítjuk.
   *
   * Egy felhasználói keresőkérdéshez 2000 karakter
   * bőven elegendő.
   */
  if (normalizedQuery.length > 2000) {
    throw new Error(
      "A keresőkérdés legfeljebb 2000 karakter hosszú lehet."
    );
  }

  /*
   * Az egyedi beállításokat összevonjuk
   * az alapértelmezett értékekkel.
   */
  const options: VectorSearchOptions = {
    ...DEFAULT_VECTOR_SEARCH_OPTIONS,
    ...customOptions,
  };

  validateSearchOptions(options);

  const documentIds = [...new Set(
    options.documentIds
      .map((documentId) => documentId.trim())
      .filter((documentId) => documentId.length > 0)
  )];

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!documentIds.every((documentId) => uuidPattern.test(documentId))) {
    throw new Error("Érvénytelen dokumentumazonosító a keresési szűrőben.");
  }

  /*
   * A felhasználói kérdés embeddingjének elkészítése.
   *
   * Ugyanazt az embeddingmodellt használjuk, mint
   * a dokumentumchunkok feldolgozásakor.
   */
  const queryEmbedding =
    await createEmbedding(normalizedQuery);

  /*
   * A JavaScript embedding átalakítása a PostgreSQL
   * által elfogadott vektorformátummá.
   */
  const formattedQueryEmbedding =
    formatVectorForPostgreSQL(queryEmbedding);

  /*
   * Az SQL-lekérdezést normál idézőjeles karakterláncokból
   * építjük fel.
   *
   * Így elkerüljük a korábban tapasztalt, sérült backtick
   * karakterből eredő template literal hibákat.
   *
   * A <=> operátor cosine distance értéket számít.
   *
   * A cosine similarity:
   *
   * 1 - cosine distance
   *
   * A WHERE részben csak:
   *
   * - completed státuszú dokumentumokat;
   * - embeddinggel rendelkező chunkokat;
   * - a minimum similarity küszöböt elérő találatokat
   *
   * engedünk át.
   */
  const documentFilter =
    documentIds.length > 0
      ? "AND document.id = ANY($3::uuid[]) "
      : "";

  const limitParameter =
    documentIds.length > 0 ? "$4" : "$3";

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

  const result =
    await databasePool.query<VectorSearchDatabaseRow>(
      vectorSearchQuery,
      queryParameters
    );

  /*
   * Az adatbázis mezőneveit frontend- és
   * TypeScript-barát struktúrává alakítjuk.
   */
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

/*
 * Több magyar/angol lekérdezés találatainak összevonása.
 * Azonos chunk csak egyszer marad meg, a legjobb hasonlósággal.
 */
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
  const uniqueQueries = [...new Set(
    queryTexts
      .map((queryText) => queryText.trim())
      .filter((queryText) => queryText.length > 0)
  )];

  if (uniqueQueries.length === 0) {
    throw new Error("Legalább egy keresőkérdés megadása kötelező.");
  }

  const requestedLimit =
    customOptions.limit ??
    DEFAULT_VECTOR_SEARCH_OPTIONS.limit;
  const candidateLimit = Math.min(
    20,
    Math.max(requestedLimit * 4, requestedLimit)
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

  const fusedResults = new Map<string, FusedSearchResult>();
  const reciprocalRankConstant = 20;

  searchResultGroups.forEach((searchResults, queryIndex) => {
    searchResults.forEach((searchResult, resultIndex) => {
      const rank = resultIndex + 1;
      const rankScore =
        1 / (reciprocalRankConstant + rank);
      const queryWeight = queryIndex === 0 ? 1.2 : 1;
      const contribution = rankScore * queryWeight;
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

      existing.fusionScore += contribution;
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

      if (secondResult.queryMatches !== firstResult.queryMatches) {
        return secondResult.queryMatches - firstResult.queryMatches;
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
   * Minden keresési változat első találata garantált helyet kap.
   * Így az angol lekérdezés legjobb angol PDF-találatát nem tudják
   * kiszorítani a több lekérdezésben közepesen jól szereplő,
   * általános magyar dokumentumrészletek.
   */
  const selectedResults: VectorSearchResult[] = [];
  const selectedChunkIds = new Set<string>();

  for (const searchResults of searchResultGroups) {
    const bestQueryResult = searchResults[0];

    if (
      bestQueryResult &&
      !selectedChunkIds.has(bestQueryResult.chunkId)
    ) {
      selectedResults.push(bestQueryResult);
      selectedChunkIds.add(bestQueryResult.chunkId);
    }
  }

  /*
   * A maradék helyeket az összevont rangsor tölti fel.
   * Dokumentumonként legfeljebb három chunkot engedünk be,
   * hogy egy általános dokumentum ne foglalja el az összes helyet.
   */
  const documentCounts = new Map<string, number>();

  for (const selectedResult of selectedResults) {
    documentCounts.set(
      selectedResult.documentId,
      (documentCounts.get(selectedResult.documentId) ?? 0) + 1
    );
  }

  for (const rankedResult of rankedResults) {
    if (selectedResults.length >= requestedLimit) {
      break;
    }

    if (selectedChunkIds.has(rankedResult.chunkId)) {
      continue;
    }

    const documentCount =
      documentCounts.get(rankedResult.documentId) ?? 0;

    if (documentCount >= 3) {
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

  const debugGroups: SearchQueryDebugGroup[] =
    uniqueQueries.map((query, queryIndex) => ({
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
    }));

  return {
    results: finalResults,
    debugGroups,
  };
}

export async function searchSimilarChunksForQueries(
  queryTexts: string[],
  customOptions: Partial<VectorSearchOptions> = {}
): Promise<VectorSearchResult[]> {
  const response =
    await searchSimilarChunksForQueriesWithDebug(
      queryTexts,
      customOptions
    );

  return response.results;
}
