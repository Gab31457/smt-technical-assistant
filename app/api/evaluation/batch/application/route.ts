import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import type {
  ApplicationBatchCaseResult,
  ApplicationBatchSummary,
  ApplicationBatchTestCase,
  ApplicationStepResult,
} from "@/lib/evaluation/application-batch-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DocumentItem {
  id: string;
  originalFilename: string;
  status: string;
  chunkCount: number;
  chunksWithEmbedding: number;
}

interface DocumentsResponse {
  success: true;
  count: number;
  documents: DocumentItem[];
}

interface ChatSource {
  originalFilename: string;
  pageNumber?: number | null;
  worksheetName?: string | null;
  rowStart?: number | null;
  rowEnd?: number | null;
}

interface ChatResponse {
  success: true;
  chatSessionId: string | null;
  answer: string;
  sources: ChatSource[];
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

interface SessionCreateResponse {
  success: true;
  session: {
    id: string;
  };
}

interface SessionDetailResponse {
  success: true;
  session: {
    id: string;
  };
  messages: Array<{
    role: string;
    content: string;
  }>;
}

interface FailedResponse {
  success: false;
  error?: {
    message?: string;
  };
  message?: string;
}

export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      "data",
      "evaluation-test-cases",
      "application-test-cases.json"
    );
    const fileContent = await readFile(filePath, "utf-8");
    const testCases = validateTestCases(
      JSON.parse(fileContent) as unknown
    );

    return NextResponse.json({ success: true, testCases });
  } catch (error) {
    console.error("Application batch betöltési hiba:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          "A data/evaluation-test-cases/application-test-cases.json fájl nem tölthető be.",
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
          message: "Nincs futtatható alkalmazásteszt.",
        },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const documents = await loadDocuments(origin);
    const results: ApplicationBatchCaseResult[] = [];

    for (const testCase of testCases) {
      results.push(
        await runTestCase(origin, testCase, documents)
      );
    }

    const summary = createSummary(results);
    const savedAt = new Date().toISOString();
    const savedResult = {
      savedAt,
      evaluationType: "application-batch",
      summary,
      results,
    };
    const outputDirectory = path.join(
      process.cwd(),
      "data",
      "evaluation-results"
    );
    await mkdir(outputDirectory, { recursive: true });
    const fileName =
      `application-batch_${savedAt.replaceAll(":", "-")}_${randomUUID().slice(0, 6)}.json`;
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
    console.error("Application batch futtatási hiba:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Az alkalmazásszintű batch futtatás sikertelen.",
      },
      { status: 500 }
    );
  }
}

async function runTestCase(
  origin: string,
  testCase: ApplicationBatchTestCase,
  documents: DocumentItem[]
): Promise<ApplicationBatchCaseResult> {
  const startedAt = performance.now();
  const steps: ApplicationStepResult[] = [];
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
    if (testCase.scenario === "document-list") {
      addStep(
        steps,
        "Dokumentumlista lekérése",
        documents.length > 0,
        startedAt,
        `${documents.length} dokumentum található.`
      );
      return complete(testCase, steps, emptyMonitoring);
    }

    if (testCase.scenario === "documents-ready") {
      const incomplete = documents.filter(
        (document) => document.status !== "completed"
      );
      addStep(
        steps,
        "Feldolgozási állapot ellenőrzése",
        incomplete.length === 0,
        startedAt,
        incomplete.length === 0
          ? "Minden dokumentum feldolgozása befejeződött."
          : `Nem kész dokumentumok: ${incomplete.map((item) => item.originalFilename).join(", ")}`
      );
      return complete(testCase, steps, emptyMonitoring);
    }

    if (testCase.scenario === "embeddings-complete") {
      const incomplete = documents.filter(
        (document) =>
          document.chunkCount === 0 ||
          document.chunkCount !== document.chunksWithEmbedding
      );
      addStep(
        steps,
        "Embeddingek ellenőrzése",
        incomplete.length === 0,
        startedAt,
        incomplete.length === 0
          ? "Minden chunk rendelkezik embeddinggel."
          : `Hiányos embeddingek: ${incomplete.map((item) => item.originalFilename).join(", ")}`
      );
      return complete(testCase, steps, emptyMonitoring);
    }

    if (
      testCase.scenario === "document-chat" ||
      testCase.scenario === "negative-document-filter" ||
      testCase.scenario === "model-mode"
    ) {
      const selectedDocument = testCase.selectedDocumentFilename
        ? findDocument(documents, testCase.selectedDocumentFilename)
        : null;
      const chat = await requestChat(origin, {
        question: testCase.question ?? "",
        knowledgeSourceMode:
          testCase.scenario === "model-mode"
            ? "model"
            : "documents",
        selectedDocumentIds:
          selectedDocument ? [selectedDocument.id] : [],
      });
      const sourceNames = chat.sources.map(
        (source) => source.originalFilename
      );

      if (testCase.scenario === "negative-document-filter") {
        const excluded = !sourceNames.some(
          (name) => matchesFilename(
            name,
            testCase.expectedDocumentFilename ?? ""
          )
        );
        addStep(
          steps,
          "Nem kijelölt dokumentum kizárása",
          excluded,
          startedAt,
          excluded
            ? "A nem kijelölt dokumentum nem szerepel a források között."
            : "A nem kijelölt dokumentum hibásan megjelent a források között."
        );
        return complete(
          testCase,
          steps,
          toMonitoring(chat)
        );
      }

      if (testCase.scenario === "model-mode") {
        addStep(
          steps,
          "Modellmód válasza",
          chat.answer.trim().length > 0,
          startedAt,
          "A modellmód választ adott."
        );
        addStep(
          steps,
          "Dokumentumforrások hiánya",
          chat.sources.length === 0,
          startedAt,
          `${chat.sources.length} dokumentumforrás érkezett.`
        );
        return complete(
          testCase,
          steps,
          toMonitoring(chat)
        );
      }

      const expectedSourceFound = chat.sources.some(
        (source) => matchesFilename(
          source.originalFilename,
          testCase.expectedDocumentFilename ?? ""
        )
      );
      addStep(
        steps,
        "Elvárt forrás használata",
        expectedSourceFound,
        startedAt,
        sourceNames.join(", ") || "Nincs forrás."
      );

      const missingAnswerParts =
        (testCase.expectedAnswerIncludes ?? []).filter(
          (part) => !normalize(chat.answer).includes(normalize(part))
        );
      addStep(
        steps,
        "Elvárt választartalom",
        missingAnswerParts.length === 0,
        startedAt,
        missingAnswerParts.length === 0
          ? "Az elvárt válaszelemek megtalálhatók."
          : `Hiányzó elemek: ${missingAnswerParts.join(", ")}`
      );

      const metadataPassed = hasExpectedMetadata(
        chat.sources,
        testCase.expectedSourceMetadata ?? "none"
      );
      addStep(
        steps,
        "Forrásmetaadat",
        metadataPassed,
        startedAt,
        `Elvárt metaadat: ${testCase.expectedSourceMetadata ?? "none"}.`
      );
      return complete(
        testCase,
        steps,
        toMonitoring(chat)
      );
    }

    if (
      testCase.scenario === "session-create-delete" ||
      testCase.scenario === "session-roundtrip"
    ) {
      return await runSessionScenario(origin, testCase, steps);
    }

    throw new Error("Ismeretlen alkalmazásteszt-forgatókönyv.");
  } catch (error) {
    return {
      testCase,
      success: false,
      passed: false,
      error:
        error instanceof Error
          ? error.message
          : "Ismeretlen alkalmazásteszt-hiba.",
      steps,
      monitoring: emptyMonitoring,
    };
  }
}

async function runSessionScenario(
  origin: string,
  testCase: ApplicationBatchTestCase,
  steps: ApplicationStepResult[]
): Promise<ApplicationBatchCaseResult> {
  let sessionId: string | null = null;
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
    const createStartedAt = performance.now();
    const createResponse = await fetch(
      `${origin}/api/chat-sessions`,
      { method: "POST", cache: "no-store" }
    );
    const createData = (await createResponse.json()) as
      | SessionCreateResponse
      | FailedResponse;
    if (!createResponse.ok || createData.success === false) {
      throw new Error(getErrorMessage(createData, "Session létrehozási hiba."));
    }
    sessionId = createData.session.id;
    addStep(
      steps,
      "Session létrehozása",
      true,
      createStartedAt,
      `Session: ${sessionId}`
    );

    if (testCase.scenario === "session-roundtrip") {
      const chat = await requestChat(origin, {
        question: testCase.question ?? "Mit jelent az SMT rövidítés?",
        knowledgeSourceMode: "model",
        selectedDocumentIds: [],
        chatSessionId: sessionId,
      });
      addStep(
        steps,
        "Üzenet mentése",
        chat.answer.trim().length > 0,
        performance.now(),
        "Az asszisztensválasz elkészült."
      );

      const loadStartedAt = performance.now();
      const detailResponse = await fetch(
        `${origin}/api/chat-sessions/${sessionId}`,
        { cache: "no-store" }
      );
      const detailData = (await detailResponse.json()) as
        | SessionDetailResponse
        | FailedResponse;
      if (!detailResponse.ok || detailData.success === false) {
        throw new Error(getErrorMessage(detailData, "Session visszatöltési hiba."));
      }
      addStep(
        steps,
        "Session visszatöltése",
        detailData.messages.some(
          (message) => message.role === "assistant"
        ),
        loadStartedAt,
        `${detailData.messages.length} üzenet töltődött vissza.`
      );

      return complete(
        testCase,
        steps,
        toMonitoring(chat)
      );
    }

    return complete(testCase, steps, emptyMonitoring);
  } finally {
    if (sessionId) {
      const deleteStartedAt = performance.now();
      const deleteResponse = await fetch(
        `${origin}/api/chat-sessions/${sessionId}`,
        { method: "DELETE", cache: "no-store" }
      );
      addStep(
        steps,
        "Tesztsession törlése",
        deleteResponse.ok,
        deleteStartedAt,
        deleteResponse.ok
          ? "A tesztsession törölve."
          : "A tesztsession törlése sikertelen."
      );
    }
  }
}

async function loadDocuments(
  origin: string
): Promise<DocumentItem[]> {
  const response = await fetch(`${origin}/api/documents`, {
    cache: "no-store",
  });
  const data = (await response.json()) as
    | DocumentsResponse
    | FailedResponse;

  if (!response.ok || data.success === false) {
    throw new Error(getErrorMessage(data, "A dokumentumlista nem tölthető be."));
  }

  return data.documents;
}

async function requestChat(
  origin: string,
  input: {
    question: string;
    knowledgeSourceMode: "documents" | "model";
    selectedDocumentIds: string[];
    chatSessionId?: string;
  }
): Promise<ChatResponse> {
  const response = await fetch(`${origin}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chatSessionId: input.chatSessionId,
      message: input.question,
      limit: 5,
      minimumSimilarity: 0.2,
      systemPromptVariant: "strict",
      knowledgeSourceMode: input.knowledgeSourceMode,
      selectedDocumentIds: input.selectedDocumentIds,
    }),
    cache: "no-store",
  });
  const data = (await response.json()) as
    | ChatResponse
    | FailedResponse;

  if (!response.ok || data.success === false) {
    throw new Error(getErrorMessage(data, "Az asszisztenshívás sikertelen."));
  }

  return data;
}

function complete(
  testCase: ApplicationBatchTestCase,
  steps: ApplicationStepResult[],
  monitoring: ApplicationBatchCaseResult["monitoring"]
): ApplicationBatchCaseResult {
  const passed =
    steps.length > 0 && steps.every((step) => step.passed);

  return {
    testCase,
    success: true,
    passed,
    error: null,
    steps,
    monitoring,
  };
}

function addStep(
  steps: ApplicationStepResult[],
  name: string,
  passed: boolean,
  startedAt: number,
  details: string
): void {
  steps.push({
    name,
    passed,
    durationMs: Math.max(
      0,
      Math.round(performance.now() - startedAt)
    ),
    details,
  });
}

function findDocument(
  documents: DocumentItem[],
  expectedFilename: string
): DocumentItem {
  const document = documents.find((item) =>
    matchesFilename(item.originalFilename, expectedFilename)
  );

  if (!document) {
    throw new Error(
      `A kijelölt dokumentum nem található: ${expectedFilename}`
    );
  }

  return document;
}

function matchesFilename(
  actual: string,
  expected: string
): boolean {
  return normalize(actual).includes(normalize(expected)) ||
    normalize(expected).includes(normalize(actual));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function hasExpectedMetadata(
  sources: ChatSource[],
  expected: "page" | "worksheet" | "none"
): boolean {
  if (expected === "none") {
    return true;
  }

  if (expected === "page") {
    return sources.some(
      (source) => typeof source.pageNumber === "number"
    );
  }

  return sources.some(
    (source) =>
      typeof source.worksheetName === "string" &&
      source.worksheetName.length > 0 &&
      typeof source.rowStart === "number" &&
      typeof source.rowEnd === "number"
  );
}

function toMonitoring(
  chat: ChatResponse
): ApplicationBatchCaseResult["monitoring"] {
  return {
    vectorSearchMs: chat.monitoring?.vectorSearchMs ?? 0,
    generationMs: chat.monitoring?.generationMs ?? 0,
    totalResponseMs: chat.monitoring?.totalResponseMs ?? 0,
    inputTokens: chat.monitoring?.inputTokens ?? 0,
    outputTokens: chat.monitoring?.outputTokens ?? 0,
    totalTokens: chat.monitoring?.totalTokens ?? 0,
    estimatedCostUsd:
      chat.monitoring?.estimatedCostUsd ?? 0,
  };
}

function createSummary(
  results: ApplicationBatchCaseResult[]
): ApplicationBatchSummary {
  const completed = results.filter((result) => result.success);
  const allSteps = completed.flatMap((result) => result.steps);
  const passedCases = completed.filter(
    (result) => result.passed
  ).length;
  const passedSteps = allSteps.filter(
    (step) => step.passed
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
    totalSteps: allSteps.length,
    passedSteps,
    stepPassRate:
      allSteps.length > 0
        ? passedSteps / allSteps.length
        : 0,
    averageCaseDurationMs: average(
      completed.map((result) =>
        result.steps.reduce(
          (total, step) => total + step.durationMs,
          0
        )
      )
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
): ApplicationBatchTestCase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is ApplicationBatchTestCase =>
      typeof item === "object" &&
      item !== null &&
      typeof Reflect.get(item, "id") === "string" &&
      typeof Reflect.get(item, "name") === "string" &&
      typeof Reflect.get(item, "scenario") === "string"
  );
}

function getErrorMessage(
  response:
    | DocumentsResponse
    | ChatResponse
    | SessionCreateResponse
    | SessionDetailResponse
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
