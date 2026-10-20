import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import {
  evaluateRagResult,
} from "@/lib/evaluation/rag-evaluation";
import type {
  RagBatchCaseResult,
  RagBatchSummary,
  RagBatchTestCase,
} from "@/lib/evaluation/batch-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatSource = RagBatchCaseResult["sources"][number];

interface ChatResponse {
  success: true;
  answer: string;
  model: string;
  retrieval: {
    resultCount: number;
    contextCount: number;
  };
  sources: ChatSource[];
  monitoring?: {
    vectorSearchMs?: number;
    totalResponseMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
}

interface FailedResponse {
  success: false;
  error?: {
    message?: string;
  };
  message?: string;
}

interface RagBatchRequest {
  testCases?: unknown;
}

export async function GET() {
  try {
    const testCasesPath = path.join(
      process.cwd(),
      "data",
      "evaluation-test-cases",
      "rag-test-cases.json"
    );
    const fileContent = await readFile(testCasesPath, "utf-8");
    const testCases = validateTestCases(
      JSON.parse(fileContent) as unknown
    );

    return NextResponse.json({
      success: true,
      testCases,
    });
  } catch (error) {
    console.error("RAG batch tesztesetek betöltési hibája:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "A data/evaluation-test-cases/rag-test-cases.json fájl nem tölthető be.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RagBatchRequest;
    const testCases = validateTestCases(body.testCases);

    if (testCases.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Nincs futtatható RAG-teszteset.",
        },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const results: RagBatchCaseResult[] = [];

    for (const testCase of testCases) {
      results.push(
        await runTestCase(origin, testCase)
      );
    }

    const summary = createSummary(results);
    const savedAt = new Date().toISOString();
    const savedResult = {
      savedAt,
      evaluationType: "rag-batch",
      summary,
      results,
    };
    const outputDirectory = path.join(
      process.cwd(),
      "data",
      "evaluation-results"
    );
    await mkdir(outputDirectory, { recursive: true });
    const timestamp = savedAt.replaceAll(":", "-");
    const shortId = randomUUID().slice(0, 6);
    const fileName =
      `rag-batch_${timestamp}_${shortId}.json`;

    await writeFile(
      path.join(outputDirectory, fileName),
      JSON.stringify(savedResult, null, 2),
      "utf-8"
    );

    return NextResponse.json({
      success: true,
      fileName,
      summary,
      results,
    });
  } catch (error) {
    console.error("RAG batch futtatási hiba:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "A RAG batch futtatás sikertelen.",
      },
      { status: 500 }
    );
  }
}

async function runTestCase(
  origin: string,
  testCase: RagBatchTestCase
): Promise<RagBatchCaseResult> {
  const emptyMetrics = {
    precisionAtK: 0,
    recallAtK: 0,
    meanReciprocalRank: 0,
    firstRelevantRank: null,
    retrievalTimeMs: 0,
    totalResponseTimeMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };

  try {
    const response = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: testCase.question,
          },
        ],
        limit: testCase.topK,
        minimumSimilarity:
          testCase.minimumSimilarity,
        systemPromptVariant:
          testCase.promptVariant,
        knowledgeSourceMode:
          testCase.knowledgeSourceMode,
        selectedDocumentIds:
          testCase.selectedDocumentIds,
      }),
      cache: "no-store",
    });
    const data = (await response.json()) as
      | ChatResponse
      | FailedResponse;

    if (!response.ok || data.success === false) {
      const message =
        data.success === false
          ? data.error?.message ||
            data.message ||
            "Az asszisztenshívás sikertelen."
          : "Az asszisztenshívás sikertelen.";
      throw new Error(message);
    }

    const ragCheck = evaluateRagResult({
      sources: data.sources,
      resultCount: data.retrieval.resultCount,
      contextCount: data.retrieval.contextCount,
      expectedSource: testCase.expectedSource,
      minimumSimilarity:
        testCase.minimumSimilarity,
      topK: testCase.topK,
      expectedDocumentIds:
        testCase.expectedDocumentIds,
      relevantChunkIndexes:
        testCase.relevantChunkIndexes,
    });

    return {
      testCase,
      success: true,
      passed: ragCheck.passed,
      error: null,
      answer: data.answer,
      model: data.model,
      sources: data.sources,
      metrics: {
        precisionAtK:
          ragCheck.retrievalMetrics.precisionAtK,
        recallAtK:
          ragCheck.retrievalMetrics.recallAtK,
        meanReciprocalRank:
          ragCheck.retrievalMetrics.meanReciprocalRank,
        firstRelevantRank:
          ragCheck.retrievalMetrics.firstRelevantRank,
        retrievalTimeMs:
          data.monitoring?.vectorSearchMs ?? 0,
        totalResponseTimeMs:
          data.monitoring?.totalResponseMs ?? 0,
        inputTokens:
          data.monitoring?.inputTokens ?? 0,
        outputTokens:
          data.monitoring?.outputTokens ?? 0,
        totalTokens:
          data.monitoring?.totalTokens ?? 0,
        estimatedCostUsd:
          data.monitoring?.estimatedCostUsd ?? 0,
      },
    };
  } catch (error) {
    return {
      testCase,
      success: false,
      passed: false,
      error:
        error instanceof Error
          ? error.message
          : "Ismeretlen teszthiba.",
      answer: "",
      model: "",
      sources: [],
      metrics: emptyMetrics,
    };
  }
}

function createSummary(
  results: RagBatchCaseResult[]
): RagBatchSummary {
  const successfulResults = results.filter(
    (result) => result.success
  );
  const completedCases = successfulResults.length;
  const failedCases =
    results.length - completedCases;
  const passedCases = successfulResults.filter(
    (result) => result.passed
  ).length;

  return {
    totalCases: results.length,
    completedCases,
    failedCases,
    passedCases,
    passRate:
      completedCases > 0
        ? passedCases / completedCases
        : 0,
    averagePrecisionAtK: average(
      successfulResults.map(
        (result) => result.metrics.precisionAtK
      )
    ),
    averageRecallAtK: average(
      successfulResults.map(
        (result) => result.metrics.recallAtK
      )
    ),
    averageMeanReciprocalRank: average(
      successfulResults.map(
        (result) =>
          result.metrics.meanReciprocalRank
      )
    ),
    averageRetrievalTimeMs: average(
      successfulResults.map(
        (result) => result.metrics.retrievalTimeMs
      )
    ),
    averageTotalResponseTimeMs: average(
      successfulResults.map(
        (result) =>
          result.metrics.totalResponseTimeMs
      )
    ),
    totalInputTokens: sum(
      successfulResults.map(
        (result) => result.metrics.inputTokens
      )
    ),
    totalOutputTokens: sum(
      successfulResults.map(
        (result) => result.metrics.outputTokens
      )
    ),
    totalTokens: sum(
      successfulResults.map(
        (result) => result.metrics.totalTokens
      )
    ),
    totalEstimatedCostUsd: Number(
      successfulResults
        .reduce(
          (total, result) =>
            total + result.metrics.estimatedCostUsd,
          0
        )
        .toFixed(8)
    ),
  };
}

function validateTestCases(
  value: unknown
): RagBatchTestCase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is RagBatchTestCase =>
      typeof item === "object" &&
      item !== null &&
      typeof Reflect.get(item, "id") === "string" &&
      typeof Reflect.get(item, "name") === "string" &&
      typeof Reflect.get(item, "question") === "string" &&
      Array.isArray(
        Reflect.get(item, "selectedDocumentIds")
      ) &&
      Array.isArray(
        Reflect.get(item, "expectedDocumentIds")
      ) &&
      Array.isArray(
        Reflect.get(item, "relevantChunkIndexes")
      )
  );
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Number(
    (
      values.reduce(
        (total, value) => total + value,
        0
      ) / values.length
    ).toFixed(4)
  );
}

function sum(values: number[]): number {
  return values.reduce(
    (total, value) => total + value,
    0
  );
}
