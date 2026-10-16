"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ResultsComparison.module.css";

interface ResultSummary {
  fileName: string;
  savedAt: string;
  evaluationType: string;
  responseTime: number;
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  contextRetention: number;
  consistency: number;
  overallScore: number;
  passed: boolean;
}

interface ResultsResponse {
  success: boolean;
  results?: ResultSummary[];
  message?: string;
}

export default function ResultsComparison() {
  const [results, setResults] =
    useState<ResultSummary[]>([]);

  const [baselineFile, setBaselineFile] =
    useState("");

  const [iterationFile, setIterationFile] =
    useState("");

  const [status, setStatus] = useState(
    "Mentett eredmények betöltése..."
  );

  const [error, setError] = useState("");

  useEffect(() => {
    loadResults();
  }, []);

  async function loadResults() {
    setStatus("Mentett eredmények betöltése...");
    setError("");

    try {
      const response = await fetch(
        "/api/evaluation/results"
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          "Az eredménylista API nem JSON-választ adott."
        );
      }

      const data =
        (await response.json()) as ResultsResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            "Az eredmények betöltése sikertelen."
        );
      }

      const loadedResults = data.results || [];

      setResults(loadedResults);

      if (loadedResults.length >= 2) {
        setBaselineFile(
          loadedResults[loadedResults.length - 1].fileName
        );

        setIterationFile(
          loadedResults[0].fileName
        );
      } else if (loadedResults.length === 1) {
        setBaselineFile(loadedResults[0].fileName);
        setIterationFile(loadedResults[0].fileName);
      }

      setStatus(
        loadedResults.length > 0
          ? `${loadedResults.length} eredmény betöltve.`
          : "Még nincs mentett automatikus teszteredmény."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ismeretlen betöltési hiba történt."
      );

      setStatus("");
    }
  }

  const baseline = useMemo(
    () =>
      results.find(
        (result) =>
          result.fileName === baselineFile
      ),
    [results, baselineFile]
  );

  const iteration = useMemo(
    () =>
      results.find(
        (result) =>
          result.fileName === iterationFile
      ),
    [results, iterationFile]
  );

  const sameEvaluationType =
    baseline &&
    iteration &&
    baseline.evaluationType ===
      iteration.evaluationType;

  return (
    <section className={styles.panel}>
      <div className={styles.headingRow}>
        <div>
          <h2>Baseline és iteráció összehasonlítása</h2>

          <p>
            Két mentett automatikus teszt eredményeinek
            összevetése.
          </p>
        </div>

        <button
          type="button"
          className={styles.refreshButton}
          onClick={loadResults}
        >
          Lista frissítése
        </button>
      </div>

      {status && (
        <p className={styles.status}>
          {status}
        </p>
      )}

      {error && (
        <p className={styles.error}>
          <strong>Hiba:</strong> {error}
        </p>
      )}

      {results.length > 0 && (
        <>
          <div className={styles.selectGrid}>
            <label className={styles.field}>
              <span>Baseline eredmény</span>

              <select
                value={baselineFile}
                onChange={(event) =>
                  setBaselineFile(event.target.value)
                }
              >
                {results.map((result) => (
                  <option
                    key={result.fileName}
                    value={result.fileName}
                  >
                    {createOptionLabel(result)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Iteráció utáni eredmény</span>

              <select
                value={iterationFile}
                onChange={(event) =>
                  setIterationFile(event.target.value)
                }
              >
                {results.map((result) => (
                  <option
                    key={result.fileName}
                    value={result.fileName}
                  >
                    {createOptionLabel(result)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!sameEvaluationType && (
            <p className={styles.warning}>
              Figyelem: eltérő teszttípusokat választottál.
              A korrekt összehasonlításhoz azonos típusú és
              lehetőleg azonos tesztkérdéssel futtatott
              eredményeket használj.
            </p>
          )}

          {baseline && iteration && (
            <>
              <div className={styles.summaryGrid}>
                <SummaryCard
                  title="Baseline"
                  result={baseline}
                />

                <SummaryCard
                  title="Iteráció"
                  result={iteration}
                />

                <ChangeCard
                  baseline={baseline}
                  iteration={iteration}
                />
              </div>

              <div className={styles.comparisonList}>
                <ComparisonRow
                  label="Összpontszám"
                  baseline={baseline.overallScore}
                  iteration={iteration.overallScore}
                  suffix="/5"
                />

                <ComparisonRow
                  label="Relevancia"
                  baseline={baseline.relevance}
                  iteration={iteration.relevance}
                  suffix="/5"
                />

                <ComparisonRow
                  label="Utasításkövetés"
                  baseline={baseline.instructionFollowing}
                  iteration={iteration.instructionFollowing}
                  suffix="/5"
                />

                <ComparisonRow
                  label="Megalapozottság"
                  baseline={baseline.groundedness}
                  iteration={iteration.groundedness}
                  suffix="/5"
                />

                <ComparisonRow
                  label="Érthetőség"
                  baseline={baseline.clarity}
                  iteration={iteration.clarity}
                  suffix="/5"
                />

                <ComparisonRow
                  label="Kontextusmegőrzés"
                  baseline={baseline.contextRetention}
                  iteration={iteration.contextRetention}
                  suffix="/5"
                />

                <ComparisonRow
                  label="Következetesség"
                  baseline={baseline.consistency}
                  iteration={iteration.consistency}
                  suffix="/5"
                />

                <ComparisonRow
                  label="Válaszidő"
                  baseline={baseline.responseTime / 1000}
                  iteration={iteration.responseTime / 1000}
                  suffix=" s"
                  lowerIsBetter
                />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function SummaryCard({
  title,
  result,
}: {
  title: string;
  result: ResultSummary;
}) {
  return (
    <div className={styles.summaryCard}>
      <h3>{title}</h3>

      <p>
        <strong>Típus:</strong>{" "}
        {result.evaluationType}
      </p>

      <p>
        <strong>Összpontszám:</strong>{" "}
        {result.overallScore.toFixed(2)}/5
      </p>

      <p>
        <strong>Eredmény:</strong>{" "}
        {result.passed
          ? "Megfelelt"
          : "Nem felelt meg"}
      </p>

      <p className={styles.fileName}>
        {result.fileName}
      </p>
    </div>
  );
}

function ChangeCard({
  baseline,
  iteration,
}: {
  baseline: ResultSummary;
  iteration: ResultSummary;
}) {
  const scoreChange =
    iteration.overallScore -
    baseline.overallScore;

  const timeChange =
    iteration.responseTime -
    baseline.responseTime;

  let resultText = "Nem változott";

  if (scoreChange > 0) {
    resultText = "Javult";
  }

  if (scoreChange < 0) {
    resultText = "Romlott";
  }

  return (
    <div className={styles.summaryCard}>
      <h3>Változás</h3>

      <p>
        <strong>Minőség:</strong>{" "}
        <span className={getChangeClass(scoreChange)}>
          {resultText}
        </span>
      </p>

      <p>
        <strong>Pontszámváltozás:</strong>{" "}
        {formatSignedNumber(scoreChange)}
      </p>

      <p>
        <strong>Válaszidő-változás:</strong>{" "}
        {formatSignedNumber(timeChange / 1000)} s
      </p>
    </div>
  );
}

function ComparisonRow({
  label,
  baseline,
  iteration,
  suffix,
  lowerIsBetter = false,
}: {
  label: string;
  baseline: number;
  iteration: number;
  suffix: string;
  lowerIsBetter?: boolean;
}) {
  const difference = iteration - baseline;

  const effectiveDifference =
    lowerIsBetter ? difference * -1 : difference;

  return (
    <div className={styles.comparisonRow}>
      <strong>{label}</strong>

      <span>
        Baseline: {baseline.toFixed(2)}
        {suffix}
      </span>

      <span>
        Iteráció: {iteration.toFixed(2)}
        {suffix}
      </span>

      <span className={getChangeClass(effectiveDifference)}>
        Változás: {formatSignedNumber(difference)}
        {suffix}
      </span>
    </div>
  );
}

function createOptionLabel(result: ResultSummary) {
  const date = result.savedAt
    ? new Date(result.savedAt).toLocaleString("hu-HU")
    : "Ismeretlen időpont";

  return (
    `${result.evaluationType} | ` +
    `${result.overallScore.toFixed(2)}/5 | ` +
    date
  );
}

function formatSignedNumber(value: number) {
  const rounded = Number(value.toFixed(2));

  if (rounded > 0) {
    return `+${rounded.toFixed(2)}`;
  }

  return rounded.toFixed(2);
}

function getChangeClass(value: number) {
  if (value > 0) {
    return styles.improved;
  }

  if (value < 0) {
    return styles.decreased;
  }

  return styles.unchanged;
}