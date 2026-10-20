import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import type {
  PromptBatchCaseResult,
  PromptBatchSummary,
  PromptBatchTestCase,
  PromptJudgeScores,
} from "@/lib/evaluation/prompt-batch-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatResponse {
  success: true;
  answer: string;
  model: string;
  knowledgeSourceMode: PromptBatchTestCase["knowledgeSourceMode"];
  sources: Array<Record<string, unknown>>;
  monitoring?: {
    vectorSearchMs?: number;
    generationMs?: number;
    totalResponseMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
}

interface JudgeResponse {
  success: true;
  model: string;
  result: PromptJudgeScores;
}

interface FailedResponse {
  success: false;
  message?: string;
  error?: {
    message?: string;
  };
}

export async function GET() {
  try {
    const testCasesPath = path.join(
      process.cwd(),
      "data",
      "evaluation-test-cases",
      "prompt-test-cases.json"
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
    console.error("Prompt batch tesztesetek betöltési hibája:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "A data/evaluation-test-cases/prompt-test-cases.json fájl nem tölthető be.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      testCases?: unknown;
    };
    const testCases = validateTestCases(body.testCases);

    if (testCases.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Nincs futtatható promptteszteset.",
        },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const results: PromptBatchCaseResult[] = [];

    for (const testCase of testCases) {
      results.push(await runTestCase(origin, testCase));
    }

    const summary = createSummary(results);
    const savedAt = new Date().toISOString();
    const savedResult = {
      savedAt,
      evaluationType: "prompt-batch",
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
    const fileName =
      `prompt-batch_${timestamp}_${randomUUID().slice(0, 6)}.json`;

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
    console.error("Prompt batch futtatási hiba:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "A prompt batch futtatás sikertelen.",
      },
      { status: 500 }
    );
  }
}

async function runTestCase(
  origin: string,
  testCase: PromptBatchTestCase
): Promise<PromptBatchCaseResult> {
  const emptyMonitoring = {
    vectorSearchMs: 0,
    generationMs: 0,
    totalResponseMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };

  try {
    const chatResponse = await fetch(`${origin}/api/chat`, {
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
        limit: 5,
        minimumSimilarity: 0.2,
        systemPromptVariant: testCase.promptVariant,
        knowledgeSourceMode: testCase.knowledgeSourceMode,
        selectedDocumentIds: testCase.selectedDocumentIds,
      }),
      cache: "no-store",
    });
    const chatData = (await chatResponse.json()) as
      | ChatResponse
      | FailedResponse;

    if (!chatResponse.ok || chatData.success === false) {
      throw new Error(
        getErrorMessage(
          chatData,
          "Az asszisztenshívás sikertelen."
        )
      );
    }

    const judgeResponse = await fetch(
      `${origin}/api/evaluation/judge`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluationType: "single-turn",
          question: testCase.question,
          answer: chatData.answer,
          expectedBehavior: testCase.expectedBehavior,
          sources: chatData.sources,
          knowledgeSourceMode:
            chatData.knowledgeSourceMode,
        }),
        cache: "no-store",
      }
    );
    const judgeData = (await judgeResponse.json()) as
      | JudgeResponse
      | FailedResponse;

    if (!judgeResponse.ok || judgeData.success === false) {
      throw new Error(
        getErrorMessage(
          judgeData,
          "Az LLM Judge futtatása sikertelen."
        )
      );
    }

    return {
      testCase,
      success: true,
      passed: judgeData.result.passed,
      error: null,
      answer: chatData.answer,
      answerModel: chatData.model,
      judgeModel: judgeData.model,
      judge: judgeData.result,
      monitoring: {
        vectorSearchMs:
          chatData.monitoring?.vectorSearchMs ?? 0,
        generationMs:
          chatData.monitoring?.generationMs ?? 0,
        totalResponseMs:
          chatData.monitoring?.totalResponseMs ?? 0,
        inputTokens:
          chatData.monitoring?.inputTokens ?? 0,
        outputTokens:
          chatData.monitoring?.outputTokens ?? 0,
        totalTokens:
          chatData.monitoring?.totalTokens ?? 0,
        estimatedCostUsd:
          chatData.monitoring?.estimatedCostUsd ?? 0,
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
          : "Ismeretlen promptteszt-hiba.",
      answer: "",
      answerModel: "",
      judgeModel: "",
      judge: null,
      monitoring: emptyMonitoring,
    };
  }
}

function createSummary(
  results: PromptBatchCaseResult[]
): PromptBatchSummary {
  const completed = results.filter(
    (result) => result.success && result.judge !== null
  );
  const judges = completed
    .map((result) => result.judge)
    .filter((judge): judge is PromptJudgeScores => judge !== null);
  const passedCases = completed.filter(
    (result) => result.passed
  ).length;

  return {
    totalCases: results.length,
    completedCases: completed.length,
    failedCases: results.length - completed.length,
    passedCases,
    passRate:
      completed.length > 0
        ? passedCases / completed.length
        : 0,
    averageRelevance: average(
      judges.map((judge) => judge.relevance)
    ),
    averageInstructionFollowing: average(
      judges.map((judge) => judge.instructionFollowing)
    ),
    averageGroundedness: average(
      judges.map((judge) => judge.groundedness)
    ),
    averageClarity: average(
      judges.map((judge) => judge.clarity)
    ),
    averageOverallScore: average(
      judges.map((judge) => judge.overallScore)
    ),
    unsupportedClaimCount: judges.reduce(
      (total, judge) =>
        total + judge.unsupportedClaims.length,
      0
    ),
    averageRetrievalTimeMs: average(
      completed.map(
        (result) => result.monitoring.vectorSearchMs
      )
    ),
    averageGenerationTimeMs: average(
      completed.map(
        (result) => result.monitoring.generationMs
      )
    ),
    averageTotalResponseTimeMs: average(
      completed.map(
        (result) => result.monitoring.totalResponseMs
      )
    ),
    totalInputTokens: sum(
      completed.map(
        (result) => result.monitoring.inputTokens
      )
    ),
    totalOutputTokens: sum(
      completed.map(
        (result) => result.monitoring.outputTokens
      )
    ),
    totalTokens: sum(
      completed.map(
        (result) => result.monitoring.totalTokens
      )
    ),
    totalEstimatedCostUsd: Number(
      completed
        .reduce(
          (total, result) =>
            total + result.monitoring.estimatedCostUsd,
          0
        )
        .toFixed(8)
    ),
  };
}

function validateTestCases(
  value: unknown
): PromptBatchTestCase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is PromptBatchTestCase =>
      typeof item === "object" &&
      item !== null &&
      typeof Reflect.get(item, "id") === "string" &&
      typeof Reflect.get(item, "name") === "string" &&
      typeof Reflect.get(item, "question") === "string" &&
      typeof Reflect.get(item, "expectedBehavior") === "string" &&
      Array.isArray(
        Reflect.get(item, "selectedDocumentIds")
      )
  );
}

function getErrorMessage(
  response:
    | ChatResponse
    | JudgeResponse
    | FailedResponse,
  fallback: string
): string {
  if (response.success === false) {
    return response.error?.message ||
      response.message ||
      fallback;
  }

  return fallback;
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
