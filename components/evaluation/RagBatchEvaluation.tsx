"use client";

import { useEffect, useState } from "react";
import type {
  RagBatchCaseResult,
  RagBatchSummary,
  RagBatchTestCase,
} from "@/lib/evaluation/batch-types";
import styles from "./RagBatchEvaluation.module.css";

interface TestCasesResponse {
  success: true;
  testCases: RagBatchTestCase[];
}

interface BatchResponse {
  success: true;
  fileName: string;
  summary: RagBatchSummary;
  results: RagBatchCaseResult[];
}

interface FailedResponse {
  success: false;
  message?: string;
}

export default function RagBatchEvaluation() {
  const [testCases, setTestCases] =
    useState<RagBatchTestCase[]>([]);
  const [result, setResult] =
    useState<BatchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    fetch("/api/evaluation/batch/rag", {
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
                "A tesztesetek betöltése sikertelen."
              : "A tesztesetek betöltése sikertelen."
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
        "/api/evaluation/batch/rag",
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
            ? data.message || "A RAG batch futtatás sikertelen."
            : "A RAG batch futtatás sikertelen."
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
          <p className={styles.eyebrow}>Kötegelt RAG-evaluáció</p>
          <h2>RAG batch futtatás</h2>
          <p className={styles.description}>
            A tesztesetek a data/evaluation-test-cases/rag-test-cases.json
            fájlból töltődnek be.
          </p>
        </div>

        <button
          type="button"
          className={styles.runButton}
          onClick={() => void runBatch()}
          disabled={isLoading || isRunning || testCases.length === 0}
        >
          {isRunning
            ? "Batch futtatás folyamatban..."
            : `Batch indítása (${testCases.length} teszt)`}
        </button>
      </div>

      {isLoading && (
        <p className={styles.status}>Tesztesetek betöltése...</p>
      )}

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      {!isLoading && testCases.length > 0 && (
        <div className={styles.caseList}>
          {testCases.map((testCase) => (
            <div className={styles.caseCard} key={testCase.id}>
              <strong>{testCase.id}: {testCase.name}</strong>
              <span>{testCase.question}</span>
              <small>
                Top {testCase.topK}, {testCase.documentType.toUpperCase()},
                {" "}{testCase.language.toUpperCase()}, releváns chunk:
                {" "}{testCase.relevantChunkIndexes.join(", ") || "nincs megadva"}
              </small>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className={styles.resultSection}>
          <h3>Összesített eredmény</h3>

          <div className={styles.metrics}>
            <Metric label="Tesztesetek" value={result.summary.totalCases} />
            <Metric label="Lefutott" value={result.summary.completedCases} />
            <Metric label="Hibás" value={result.summary.failedCases} />
            <Metric label="Megfelelt" value={result.summary.passedCases} />
            <Metric
              label="Megfelelési arány"
              value={`${(result.summary.passRate * 100).toFixed(1)}%`}
            />
            <Metric
              label="Átlag Precision@K"
              value={result.summary.averagePrecisionAtK.toFixed(3)}
            />
            <Metric
              label="Átlag Recall@K"
              value={result.summary.averageRecallAtK.toFixed(3)}
            />
            <Metric
              label="Átlag MRR"
              value={result.summary.averageMeanReciprocalRank.toFixed(3)}
            />
            <Metric
              label="Átlag retrieval idő"
              value={`${result.summary.averageRetrievalTimeMs.toFixed(0)} ms`}
            />
            <Metric
              label="Átlag teljes válaszidő"
              value={`${result.summary.averageTotalResponseTimeMs.toFixed(0)} ms`}
            />
            <Metric label="Összes token" value={result.summary.totalTokens} />
            <Metric
              label="Becsült összköltség"
              value={`${result.summary.totalEstimatedCostUsd.toFixed(6)} USD`}
            />
          </div>

          <p className={styles.savedFile}>
            Mentett eredmény: <strong>{result.fileName}</strong>
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
                  {caseResult.testCase.id}: {caseResult.testCase.name}
                </strong>
                <span>
                  {caseResult.success
                    ? caseResult.passed
                      ? "Megfelelt"
                      : "Nem felelt meg"
                    : `Futtatási hiba: ${caseResult.error}`}
                </span>
                <small>
                  Precision: {caseResult.metrics.precisionAtK.toFixed(3)},
                  {" "}Recall: {caseResult.metrics.recallAtK.toFixed(3)},
                  {" "}MRR: {caseResult.metrics.meanReciprocalRank.toFixed(3)}
                </small>
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
