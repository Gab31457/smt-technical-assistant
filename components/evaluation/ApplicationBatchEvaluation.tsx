"use client";

import { useEffect, useState } from "react";
import type {
  ApplicationBatchCaseResult,
  ApplicationBatchSummary,
  ApplicationBatchTestCase,
} from "@/lib/evaluation/application-batch-types";
import styles from "./ApplicationBatchEvaluation.module.css";

interface TestCasesResponse {
  success: true;
  testCases: ApplicationBatchTestCase[];
}

interface BatchResponse {
  success: true;
  fileName: string;
  summary: ApplicationBatchSummary;
  results: ApplicationBatchCaseResult[];
}

interface FailedResponse {
  success: false;
  message?: string;
}

export default function ApplicationBatchEvaluation() {
  const [testCases, setTestCases] =
    useState<ApplicationBatchTestCase[]>([]);
  const [result, setResult] =
    useState<BatchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    fetch("/api/evaluation/batch/application", {
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
                "Az alkalmazástesztek betöltése sikertelen."
              : "Az alkalmazástesztek betöltése sikertelen."
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
        "/api/evaluation/batch/application",
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
              "Az alkalmazásszintű batch futtatás sikertelen."
            : "Az alkalmazásszintű batch futtatás sikertelen."
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
            Kötegelt alkalmazásszintű evaluáció
          </p>
          <h2>Alkalmazás batch futtatás</h2>
          <p className={styles.description}>
            A tíz user journey a
            data/evaluation-test-cases/application-test-cases.json
            fájlból töltődik be. A teszt nem töröl dokumentumot.
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
            ? "Alkalmazás batch folyamatban..."
            : `Batch indítása (${testCases.length} teszt)`}
        </button>
      </div>

      {isLoading && (
        <p className={styles.status}>
          Alkalmazástesztek betöltése...
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
              <span>{testCase.scenario}</span>
              {testCase.question && (
                <small>{testCase.question}</small>
              )}
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
              label="Futtatási hiba"
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
              label="Tesztlépések"
              value={result.summary.totalSteps}
            />
            <Metric
              label="Megfelelt lépések"
              value={result.summary.passedSteps}
            />
            <Metric
              label="Lépések megfelelési aránya"
              value={`${(
                result.summary.stepPassRate * 100
              ).toFixed(1)}%`}
            />
            <Metric
              label="Átlag tesztidő"
              value={`${
                result.summary.averageCaseDurationMs.toFixed(0)
              } ms`}
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

                <ul className={styles.stepList}>
                  {caseResult.steps.map((step, index) => (
                    <li key={`${caseResult.testCase.id}-${index}`}>
                      <strong>
                        {step.passed ? "OK" : "HIBA"}: {step.name}
                      </strong>
                      <span>{step.details}</span>
                      <small>{step.durationMs} ms</small>
                    </li>
                  ))}
                </ul>
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
