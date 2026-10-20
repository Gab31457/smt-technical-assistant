export type PromptVariant =
  | "strict"
  | "conversational"
  | "default";

export type KnowledgeSourceMode =
  | "documents"
  | "model"
  | "hybrid";

export interface PromptBatchTestCase {
  id: string;
  name: string;
  question: string;
  expectedBehavior: string;
  promptVariant: PromptVariant;
  knowledgeSourceMode: KnowledgeSourceMode;
  selectedDocumentIds: string[];
  category:
    | "documented-fact"
    | "multilingual"
    | "missing-information"
    | "instruction-following"
    | "source-grounding";
  language: "hu" | "en";
}

export interface PromptJudgeScores {
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  contextRetention: number;
  consistency: number;
  overallScore: number;
  passed: boolean;
  unsupportedClaims: string[];
  explanation: string;
}

export interface PromptBatchCaseResult {
  testCase: PromptBatchTestCase;
  success: boolean;
  passed: boolean;
  error: string | null;
  answer: string;
  answerModel: string;
  judgeModel: string;
  judge: PromptJudgeScores | null;
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

export interface PromptBatchSummary {
  totalCases: number;
  completedCases: number;
  failedCases: number;
  passedCases: number;
  passRate: number;
  averageRelevance: number;
  averageInstructionFollowing: number;
  averageGroundedness: number;
  averageClarity: number;
  averageOverallScore: number;
  unsupportedClaimCount: number;
  averageRetrievalTimeMs: number;
  averageGenerationTimeMs: number;
  averageTotalResponseTimeMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
}
