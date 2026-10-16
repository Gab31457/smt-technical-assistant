"use client";

import { useState } from "react";
import styles from "./HumanReviewForm.module.css";

interface HumanReviewFormProps {
  evaluationFileName: string;
  judgePassed: boolean;
}

interface SaveResponse {
  success: boolean;
  fileName?: string;
  message?: string;
}

export default function HumanReviewForm({
  evaluationFileName,
  judgePassed,
}: HumanReviewFormProps) {
  const [humanScore, setHumanScore] = useState(4);
  const [passed, setPassed] = useState(true);
  const [agreesWithJudge, setAgreesWithJudge] =
    useState(true);

  const [comment, setComment] = useState("");
  const [savedReviewFile, setSavedReviewFile] =
    useState("");

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function saveReview() {
    setIsSaving(true);
    setSavedReviewFile("");
    setStatus("Az emberi értékelés mentése...");
    setError("");

    try {
      const response = await fetch(
        "/api/evaluation/human-review",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            evaluationFileName,
            humanScore,
            passed,
            agreesWithJudge,
            comment: comment.trim(),
          }),
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          "Az emberi értékelési API nem JSON-választ adott."
        );
      }

      const data =
        (await response.json()) as SaveResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            "Az emberi értékelés mentése sikertelen."
        );
      }

      setSavedReviewFile(data.fileName ?? "");

      setStatus(
        "Az emberi értékelés sikeresen elmentve."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ismeretlen mentési hiba történt."
      );

      setStatus("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={styles.panel}>
      <h2>Emberi értékelés</h2>

      <p className={styles.description}>
        Az automatikus LLM as Judge eredmény kézi
        ellenőrzése és felülvizsgálata.
      </p>

      <div className={styles.info}>
        <p>
          <strong>Kapcsolódó tesztfájl:</strong>{" "}
          {evaluationFileName}
        </p>

        <p>
          <strong>LLM Judge eredménye:</strong>{" "}
          {judgePassed
            ? "Megfelelt"
            : "Nem felelt meg"}
        </p>
      </div>

      <label className={styles.field}>
        <span>Emberi pontszám</span>

        <select
          value={humanScore}
          onChange={(event) =>
            setHumanScore(Number(event.target.value))
          }
          disabled={isSaving}
        >
          <option value={1}>1 - Nagyon gyenge</option>
          <option value={2}>2 - Gyenge</option>
          <option value={3}>3 - Elfogadható</option>
          <option value={4}>4 - Jó</option>
          <option value={5}>5 - Kiváló</option>
        </select>
      </label>

      <label className={styles.field}>
        <span>Emberi eredmény</span>

        <select
          value={passed ? "passed" : "failed"}
          onChange={(event) =>
            setPassed(event.target.value === "passed")
          }
          disabled={isSaving}
        >
          <option value="passed">Megfelelt</option>
          <option value="failed">
            Nem felelt meg
          </option>
        </select>
      </label>

      <label className={styles.field}>
        <span>Egyetértés az LLM Judge-dzsal</span>

        <select
          value={agreesWithJudge ? "yes" : "no"}
          onChange={(event) =>
            setAgreesWithJudge(
              event.target.value === "yes"
            )
          }
          disabled={isSaving}
        >
          <option value="yes">Igen</option>
          <option value="no">Nem</option>
        </select>
      </label>

      <label className={styles.field}>
        <span>Emberi megjegyzés</span>

        <textarea
          value={comment}
          onChange={(event) =>
            setComment(event.target.value)
          }
          rows={4}
          maxLength={2000}
          placeholder="Rövid szakmai megjegyzés az automatikus értékeléshez..."
          disabled={isSaving}
        />
      </label>

      <button
        type="button"
        className={styles.saveButton}
        onClick={saveReview}
        disabled={isSaving}
      >
        {isSaving
          ? "Értékelés mentése..."
          : "Emberi értékelés mentése"}
      </button>

      {status && (
        <p className={styles.status}>
          {status}
        </p>
      )}

      {savedReviewFile && (
        <p className={styles.savedFile}>
          Mentett emberi értékelés:{" "}
          <strong>{savedReviewFile}</strong>
        </p>
      )}

      {error && (
        <p className={styles.error}>
          <strong>Hiba:</strong> {error}
        </p>
      )}
    </section>
  );
}