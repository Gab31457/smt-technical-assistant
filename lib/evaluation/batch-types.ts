export interface RagBatchTestCase {
  id: string;
  name: string;
  question: string;
  expectedBehavior: string;
  expectedSource: string;
  expectedDocumentIds: string[];
  relevantChunkIndexes: number[];
  selectedDocumentIds: string[];
  topK: number;
  minimumSimilarity: number;
  promptVariant: "strict" | "conversational" | "default";
  knowledgeSourceMode: "documents" | "model" | "hybrid";
  language: "hu" | "en";
  documentType: "pdf" | "docx" | "xlsx" | "txt" | "md";
}

export interface RagBatchCaseMetrics {
  precisionAtK: number;
  recallAtK: number;
  meanReciprocalRank: number;
  firstRelevantRank: number | null;
  retrievalTimeMs: number;
  totalResponseTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface RagBatchCaseResult {
  testCase: RagBatchTestCase;
  success: boolean;
  passed: boolean;
  error: string | null;
  answer: string;
  model: string;
  sources: Array<{
    documentId: string;
    chunkId: string;
    chunkIndex: number;
    originalFilename: string;
    documentTitle: string | null;
    similarity: number;
  }>;
  metrics: RagBatchCaseMetrics;
}

export interface RagBatchSummary {
  totalCases: number;
  completedCases: number;
  failedCases: number;
  passedCases: number;
  passRate: number;
  averagePrecisionAtK: number;
  averageRecallAtK: number;
  averageMeanReciprocalRank: number;
  averageRetrievalTimeMs: number;
  averageTotalResponseTimeMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
}
