"use client";

import { useEffect, useState } from "react";
import type {
  PromptBatchCaseResult,
  PromptBatchSummary,
  PromptBatchTestCase,
} from "@/lib/evaluation/prompt-batch-types";
import styles from "./PromptBatchEvaluation.module.css";

interface TestCasesResponse {
  success: true;
  testCases: PromptBatchTestCase[];
}

interface BatchResponse {
  success: true;
  fileName: string;
  summary: PromptBatchSummary;
  results: PromptBatchCaseResult[];
}

interface FailedResponse {
  success: false;
  message?: string;
}

export default function PromptBatchEvaluation() {
  const [testCases, setTestCases] =
    useState<PromptBatchTestCase[]>([]);
  const [result, setResult] =
    useState<BatchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    fetch("/api/evaluation/batch/prompt", {
      cache: "no-store",
      signal: abortController.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as
          | TestCasesResponse
          | FailedResponse;

        if (!response.ok || data.success === false) {
          throw new Error(
            data.success === false
              ? data.message ||
                "A prompttesztek betöltése sikertelen."
              : "A prompttesztek betöltése sikertelen."
          );
        }

        return data.testCases;
      })
      .then((loadedTestCases) => {
        setTestCases(loadedTestCases);
        setError(null);
      })
      .catch((caughtError: unknown) => {
        if (
          caughtError instanceof DOMException &&
          caughtError.name === "AbortError"
        ) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Ismeretlen betöltési hiba történt."
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, []);

  async function runBatch(): Promise<void> {
    if (testCases.length === 0 || isRunning) {
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        "/api/evaluation/batch/prompt",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ testCases }),
        }
      );
      const data = (await response.json()) as
        | BatchResponse
        | FailedResponse;

      if (!response.ok || data.success === false) {
        throw new Error(
          data.success === false
            ? data.message ||
              "A prompt batch futtatás sikertelen."
            : "A prompt batch futtatás sikertelen."
        );
      }

      setResult(data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ismeretlen batch futtatási hiba történt."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.eyebrow}>
            Kötegelt prompt-evaluáció
          </p>
          <h2>Prompt batch futtatás</h2>
          <p className={styles.description}>
            A tesztesetek a
            data/evaluation-test-cases/prompt-test-cases.json
            fájlból töltődnek be. Minden teszt külön asszisztens- és
            Judge-hívást végez.
          </p>
        </div>

        <button
          type="button"
          className={styles.runButton}
          onClick={() => void runBatch()}
          disabled={
            isLoading ||
            isRunning ||
            testCases.length === 0
          }
        >
          {isRunning
            ? "Prompt batch folyamatban..."
            : `Batch indítása (${testCases.length} teszt)`}
        </button>
      </div>

      {isLoading && (
        <p className={styles.status}>
          Prompttesztek betöltése...
        </p>
      )}

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      {!isLoading && testCases.length > 0 && (
        <div className={styles.caseList}>
          {testCases.map((testCase) => (
            <div
              className={styles.caseCard}
              key={testCase.id}
            >
              <strong>
                {testCase.id}: {testCase.name}
              </strong>
              <span>{testCase.question}</span>
              <small>
                {testCase.category}, {testCase.language.toUpperCase()},
                {" "}{testCase.promptVariant},
                {" "}{testCase.knowledgeSourceMode}
              </small>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className={styles.resultSection}>
          <h3>Összesített eredmény</h3>

          <div className={styles.metrics}>
            <Metric
              label="Tesztesetek"
              value={result.summary.totalCases}
            />
            <Metric
              label="Lefutott"
              value={result.summary.completedCases}
            />
            <Metric
              label="Hibás"
              value={result.summary.failedCases}
            />
            <Metric
              label="Megfelelt"
              value={result.summary.passedCases}
            />
            <Metric
              label="Megfelelési arány"
              value={`${(
                result.summary.passRate * 100
              ).toFixed(1)}%`}
            />
            <Metric
              label="Átlag relevancia"
              value={result.summary.averageRelevance.toFixed(2)}
            />
            <Metric
              label="Átlag utasításkövetés"
              value={
                result.summary.averageInstructionFollowing.toFixed(2)
              }
            />
            <Metric
              label="Átlag groundedness"
              value={result.summary.averageGroundedness.toFixed(2)}
            />
            <Metric
              label="Átlag érthetőség"
              value={result.summary.averageClarity.toFixed(2)}
            />
            <Metric
              label="Átlag összpontszám"
              value={result.summary.averageOverallScore.toFixed(2)}
            />
            <Metric
              label="Nem alátámasztott állítások"
              value={result.summary.unsupportedClaimCount}
            />
            <Metric
              label="Átlag retrieval idő"
              value={`${
                result.summary.averageRetrievalTimeMs.toFixed(0)
              } ms`}
            />
            <Metric
              label="Átlag generálási idő"
              value={`${
                result.summary.averageGenerationTimeMs.toFixed(0)
              } ms`}
            />
            <Metric
              label="Átlag teljes válaszidő"
              value={`${
                result.summary.averageTotalResponseTimeMs.toFixed(0)
              } ms`}
            />
            <Metric
              label="Összes token"
              value={result.summary.totalTokens}
            />
            <Metric
              label="Becsült összköltség"
              value={`${
                result.summary.totalEstimatedCostUsd.toFixed(6)
              } USD`}
            />
          </div>

          <p className={styles.savedFile}>
            Mentett eredmény:{" "}
            <strong>{result.fileName}</strong>
          </p>

          <div className={styles.caseList}>
            {result.results.map((caseResult) => (
              <div
                className={
                  caseResult.passed
                    ? styles.passedCase
                    : styles.failedCase
                }
                key={caseResult.testCase.id}
              >
                <strong>
                  {caseResult.testCase.id}:{" "}
                  {caseResult.testCase.name}
                </strong>
                <span>
                  {caseResult.success
                    ? caseResult.passed
                      ? "Megfelelt"
                      : "Nem felelt meg"
                    : `Futtatási hiba: ${caseResult.error}`}
                </span>
                {caseResult.judge && (
                  <small>
                    Relevancia: {caseResult.judge.relevance}/5,
                    {" "}utasításkövetés:{" "}
                    {caseResult.judge.instructionFollowing}/5,
                    {" "}groundedness:{" "}
                    {caseResult.judge.groundedness}/5,
                    {" "}összpontszám:{" "}
                    {caseResult.judge.overallScore.toFixed(2)}
                  </small>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
