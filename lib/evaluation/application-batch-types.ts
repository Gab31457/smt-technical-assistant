export type ApplicationScenario =
  | "document-list"
  | "documents-ready"
  | "embeddings-complete"
  | "document-chat"
  | "negative-document-filter"
  | "model-mode"
  | "session-create-delete"
  | "session-roundtrip";

export interface ApplicationBatchTestCase {
  id: string;
  name: string;
  scenario: ApplicationScenario;
  question?: string;
  expectedDocumentFilename?: string;
  selectedDocumentFilename?: string;
  expectedAnswerIncludes?: string[];
  expectedSourceMetadata?:
    | "page"
    | "worksheet"
    | "none";
  language?: "hu" | "en";
}

export interface ApplicationStepResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

export interface ApplicationBatchCaseResult {
  testCase: ApplicationBatchTestCase;
  success: boolean;
  passed: boolean;
  error: string | null;
  steps: ApplicationStepResult[];
  monitoring: {
    vectorSearchMs: number;
    generationMs: number;
    totalResponseMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
}

export interface ApplicationBatchSummary {
  totalCases: number;
  completedCases: number;
  failedCases: number;
  passedCases: number;
  passRate: number;
  totalSteps: number;
  passedSteps: number;
  stepPassRate: number;
  averageCaseDurationMs: number;
  averageRetrievalTimeMs: number;
  averageGenerationTimeMs: number;
  averageTotalResponseTimeMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
}
