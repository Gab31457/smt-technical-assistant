"use client";

import { useState } from "react";
import type { ChatMessageInput } from "@/lib/chat-types";
import styles from "./EvaluationDashboard.module.css";
import HumanReviewForm from "./HumanReviewForm";
import {
  evaluateRagResult,
  type RagCheckResult,
} from "../../lib/evaluation/rag-evaluation";

type EvaluationType =
  | "single-turn"
  | "ab-test"
  | "multi-turn"
  | "rag";

type PromptVariant =
  | "strict"
  | "conversational"
  | "default";

type KnowledgeSourceMode =
  | "documents"
  | "model"
  | "hybrid";

interface Source {
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
  content: string;
}

interface ChatSuccess {
  success: true;
  answer: string;
  model: string;
  systemPromptVariant: PromptVariant;
  knowledgeSourceMode: KnowledgeSourceMode;
  retrieval: {
    resultCount: number;
    contextCount: number;
  };
  sources: Source[];
}

interface ApiError {
  success: false;
  message?: string;
  error?: {
    message: string;
  };
}

interface JudgeResult {
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

interface JudgeSuccess {
  success: true;
  model: string;
  result: JudgeResult;
}

interface EvaluationResult {
  answer: string;
  answerModel: string;
  promptVariant: PromptVariant;
  knowledgeSourceMode: KnowledgeSourceMode;
  responseTime: number;
  resultCount: number;
  contextCount: number;
  sources: Source[];
  judgeModel: string;
  judge: JudgeResult;
}

interface ConversationTurn {
  user: string;
  assistant: string;
}

interface MultiTurnResult {
  turns: ConversationTurn[];
  messages: ChatMessageInput[];
  finalEvaluation: EvaluationResult;
  totalResponseTime: number;
  simulatorModel: string;
  stopReason: string;
}

interface RagEvaluationResult {
  evaluation: EvaluationResult;
  ragCheck: RagCheckResult;
  expectedSource: string;
  minimumSimilarity: number;
}

interface SaveResponse {
  success: boolean;
  fileName?: string;
  message?: string;
}

interface SimulatedUserSuccess {
  success: true;
  model: string;
  result: {
    message: string;
    shouldStop: boolean;
    reason: string;
  };
}

export default function EvaluationDashboard() {
  const [evaluationType, setEvaluationType] =
    useState<EvaluationType>("single-turn");

  const [promptVariant, setPromptVariant] =
    useState<PromptVariant>("strict");
  const [knowledgeSourceMode, setKnowledgeSourceMode] =
    useState<KnowledgeSourceMode>("documents");

  const [question, setQuestion] = useState(
    "Mit jelent a dokumentumban szereplő hibakód, és milyen ellenőrzési lépéseket ír elő?"
  );

  const [expectedBehavior, setExpectedBehavior] = useState(
    "Az asszisztens kizárólag a feltöltött SMT műszaki dokumentumok alapján válaszoljon, ne találjon ki hiányzó műszaki információt, és nevezze meg a felhasznált forrást."
  );

  const [expectedSource, setExpectedSource] = useState("");

  const [minimumSimilarity, setMinimumSimilarity] =
    useState(0.5);

  const [simulatorPersona, setSimulatorPersona] = useState(
    "Olyan SMT technikus, aki egy géphibát vizsgál, de a géptípust, a hibakódot és a hiba körülményeit fokozatosan adja meg."
  );

  const [simulatorGoal, setSimulatorGoal] = useState(
    "Kapjon a megfelelő műszaki dokumentumon alapuló, következetes hibakeresési segítséget."
  );

  const [simulatorHiddenConstraints, setSimulatorHiddenConstraints] =
    useState(
      "Az asszisztens tartsa meg a korábban megadott géptípust és hibakódot, ne keverjen össze eltérő berendezéseket, és csak dokumentált ellenőrzési lépéseket adjon."
    );

  const [simulatorInitialMessage, setSimulatorInitialMessage] =
    useState("A gép hibát jelez. Segíts a hiba kivizsgálásában!");

  const [simulatorMaximumTurns, setSimulatorMaximumTurns] =
    useState(3);

  const [singleResult, setSingleResult] =
    useState<EvaluationResult | null>(null);

  const [abResults, setAbResults] =
    useState<EvaluationResult[]>([]);

  const [multiTurnResult, setMultiTurnResult] =
    useState<MultiTurnResult | null>(null);

  const [ragResult, setRagResult] =
    useState<RagEvaluationResult | null>(null);

  const [savedFileName, setSavedFileName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
// Meghatározza az utolsó futtatás Judge-eredményét.
const currentJudgePassed =
  singleResult?.judge.passed ??
  multiTurnResult?.finalEvaluation.judge.passed ??
  ragResult?.evaluation.judge.passed ??
  (abResults.length === 2
    ? abResults[0].judge.passed &&
      abResults[1].judge.passed
    : false);

  // Meghívja a meglévő SMT műszaki asszisztens API-t.
  async function requestChat(
    input: string | ChatMessageInput[],
    variant: PromptVariant,
    sourceMode: KnowledgeSourceMode
  ) {
    const messages: ChatMessageInput[] =
      typeof input === "string"
        ? [
            {
              role: "user",
              content: input,
            },
          ]
        : input;

    const startTime = performance.now();

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        systemPromptVariant: variant,
        knowledgeSourceMode: sourceMode,
      }),
    });

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "A chat API nem JSON-választ adott."
      );
    }

    const data = (await response.json()) as
      | ChatSuccess
      | ApiError;

    if (!response.ok || !data.success) {
      const message =
        !data.success
          ? data.error?.message ||
            data.message ||
            "Az SMT műszaki asszisztens futtatása sikertelen."
          : "Az SMT műszaki asszisztens futtatása sikertelen.";

      throw new Error(message);
    }

    return {
      data,
      responseTime: performance.now() - startTime,
    };
  }

  // Meghívja az LLM as Judge API-t.
  async function requestJudge({
    evaluationType,
    question,
    answer,
    conversation,
    expectedBehavior,
    sources,
  }: {
    evaluationType: "single-turn" | "multi-turn";
    question?: string;
    answer: string;
    conversation?: string;
    expectedBehavior: string;
    sources: Source[];
  }) {
    const response = await fetch(
      "/api/evaluation/judge",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluationType,
          question,
          answer,
          conversation,
          expectedBehavior,
          sources,
        }),
      }
    );

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "A Judge API nem JSON-választ adott."
      );
    }

    const data = (await response.json()) as
      | JudgeSuccess
      | ApiError;

    if (!response.ok || !data.success) {
      const message =
        !data.success
          ? data.message ||
            data.error?.message ||
            "Az LLM Judge értékelése sikertelen."
          : "Az LLM Judge értékelése sikertelen.";

      throw new Error(message);
    }

    return data;
  }

  // Lefuttatja az asszisztenst és a Judge értékelést.
  async function runAssistantAndJudge(
    variant: PromptVariant,
    sourceMode: KnowledgeSourceMode,
    normalizedQuestion: string,
    normalizedExpectation: string
  ): Promise<EvaluationResult> {
    const promptLabel =
      variant === "strict"
        ? "szigorúan forráshű"
        : variant === "conversational"
          ? "beszélgető és segítő"
          : "alapértelmezett modellviselkedés";

    setStatus(`A ${promptLabel} változat fut...`);

    const chat = await requestChat(
      normalizedQuestion,
      variant,
      sourceMode
    );

    setStatus("Az LLM Judge értékeli a választ...");

    const judge = await requestJudge({
      evaluationType: "single-turn",
      question: normalizedQuestion,
      answer: chat.data.answer,
      expectedBehavior: normalizedExpectation,
      sources: chat.data.sources,
    });

    return {
      answer: chat.data.answer,
      answerModel: chat.data.model,
      promptVariant: chat.data.systemPromptVariant,
      knowledgeSourceMode: chat.data.knowledgeSourceMode,
      responseTime: chat.responseTime,
      resultCount: chat.data.retrieval.resultCount,
      contextCount: chat.data.retrieval.contextCount,
      sources: chat.data.sources,
      judgeModel: judge.model,
      judge: judge.result,
    };
  }

  // Az asszisztens válasza alapján elkészíti
  // a szimulált felhasználó következő üzenetét.
  async function requestSimulatedUser({
    conversation,
    turnNumber,
    maximumTurns,
  }: {
    conversation: ChatMessageInput[];
    turnNumber: number;
    maximumTurns: number;
  }) {
    setStatus(
      `A szimulált felhasználó reagál a ${turnNumber}. válaszra...`
    );

    const response = await fetch(
      "/api/evaluation/simulate-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          persona: simulatorPersona.trim(),
          goal: simulatorGoal.trim(),
          hiddenConstraints:
            simulatorHiddenConstraints.trim(),
          conversation,
          turnNumber,
          maximumTurns,
        }),
      }
    );

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "A user simulator API nem JSON-választ adott."
      );
    }

    const data = (await response.json()) as
      | SimulatedUserSuccess
      | ApiError;

    if (!response.ok || !data.success) {
      const message =
        !data.success
          ? data.message ||
            data.error?.message ||
            "A szimulált felhasználó futtatása sikertelen."
          : "A szimulált felhasználó futtatása sikertelen.";

      throw new Error(message);
    }

    return data;
  }

  // Lefuttatja az adaptív Multi-turn beszélgetést.
  async function runMultiTurnTest(
    initialMessage: string,
    expectation: string,
    maximumTurns: number
  ): Promise<MultiTurnResult> {
    const turns: ConversationTurn[] = [];
    const messages: ChatMessageInput[] = [];

    let totalResponseTime = 0;
    let lastChat: ChatSuccess | null = null;
    let lastResponseTime = 0;
    let currentUserMessage = initialMessage;
    let simulatorModel = "";
    let stopReason =
      "A szimuláció elérte a maximális fordulószámot.";

    for (
      let turnNumber = 1;
      turnNumber <= maximumTurns;
      turnNumber += 1
    ) {
      setStatus(
        `Adaptív Multi-turn teszt: ${turnNumber}. asszisztensforduló fut...`
      );

      messages.push({
        role: "user",
        content: currentUserMessage,
      });

      const chat = await requestChat(
        messages,
        promptVariant,
        knowledgeSourceMode
      );

      lastChat = chat.data;
      lastResponseTime = chat.responseTime;
      totalResponseTime += chat.responseTime;

      messages.push({
        role: "assistant",
        content: chat.data.answer,
      });

      turns.push({
        user: currentUserMessage,
        assistant: chat.data.answer,
      });

      if (turnNumber >= maximumTurns) {
        stopReason =
          "A szimuláció elérte a maximális fordulószámot.";
        break;
      }

      const simulatedUser =
        await requestSimulatedUser({
          conversation: messages,
          turnNumber,
          maximumTurns,
        });

      simulatorModel = simulatedUser.model;
      stopReason = simulatedUser.result.reason;

      if (simulatedUser.result.shouldStop) {
        break;
      }

      currentUserMessage =
        simulatedUser.result.message.trim();

      if (!currentUserMessage) {
        throw new Error(
          "A szimulált felhasználó üres üzenetet adott."
        );
      }
    }

    if (!lastChat || turns.length === 0) {
      throw new Error(
        "A multi-turn beszélgetés nem adott eredményt."
      );
    }

    setStatus(
      "Az LLM Judge értékeli a teljes beszélgetést..."
    );

    const conversationText = messages
      .map((message, index) => {
        const speaker =
          message.role === "user"
            ? "Felhasználó"
            : "Asszisztens";

        return `${index + 1}. ${speaker}: ${message.content}`;
      })
      .join("\n\n");

    const finalAnswer =
      turns[turns.length - 1].assistant;

    const judge = await requestJudge({
      evaluationType: "multi-turn",
      answer: finalAnswer,
      conversation: conversationText,
      expectedBehavior: expectation,
      sources: lastChat.sources,
    });

    const finalEvaluation: EvaluationResult = {
      answer: finalAnswer,
      answerModel: lastChat.model,
      promptVariant: lastChat.systemPromptVariant,
      knowledgeSourceMode: lastChat.knowledgeSourceMode,
      responseTime: lastResponseTime,
      resultCount: lastChat.retrieval.resultCount,
      contextCount: lastChat.retrieval.contextCount,
      sources: lastChat.sources,
      judgeModel: judge.model,
      judge: judge.result,
    };

    return {
      turns,
      messages,
      finalEvaluation,
      totalResponseTime,
      simulatorModel,
      stopReason,
    };
  }

  // Külön JSON-fájlba menti a teszteredményt.
  async function saveEvaluation(data: object) {
    setStatus("A teszteredmény mentése...");

    const response = await fetch(
      "/api/evaluation/save",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "A mentési API nem JSON-választ adott."
      );
    }

    const dataFromApi =
      (await response.json()) as SaveResponse;

    if (!response.ok || !dataFromApi.success) {
      throw new Error(
        dataFromApi.message ||
          "A teszteredmény mentése sikertelen."
      );
    }

    setSavedFileName(dataFromApi.fileName ?? "");
  }

  // Lefuttatja a kiválasztott teszttípust.
  async function runTest() {
    const normalizedQuestion = question.trim();
    const normalizedExpectation = expectedBehavior.trim();

    setIsRunning(true);
    setSingleResult(null);
    setAbResults([]);
    setMultiTurnResult(null);
    setRagResult(null);
    setSavedFileName("");
    setStatus("");
    setError("");

    try {
      if (evaluationType === "single-turn") {
        if (!normalizedQuestion) {
          throw new Error(
            "A tesztkérdés nem lehet üres."
          );
        }

        const result = await runAssistantAndJudge(
          promptVariant,
          knowledgeSourceMode,
          normalizedQuestion,
          normalizedExpectation
        );

        setSingleResult(result);

        await saveEvaluation({
          evaluationType: "single-turn",
          knowledgeSourceMode,
          question: normalizedQuestion,
          expectedBehavior: normalizedExpectation,
          result,
        });

        setStatus(
          "A single-turn teszt és a mentés elkészült."
        );

        return;
      }

      if (evaluationType === "ab-test") {
        if (!normalizedQuestion) {
          throw new Error(
            "A tesztkérdés nem lehet üres."
          );
        }

        const strictResult = await runAssistantAndJudge(
          "strict",
          knowledgeSourceMode,
          normalizedQuestion,
          normalizedExpectation
        );

        const conversationalResult =
          await runAssistantAndJudge(
            "conversational",
            knowledgeSourceMode,
            normalizedQuestion,
            normalizedExpectation
          );

        const results = [
          strictResult,
          conversationalResult,
        ];

        setAbResults(results);

        await saveEvaluation({
          evaluationType: "ab-test",
          knowledgeSourceMode,
          question: normalizedQuestion,
          expectedBehavior: normalizedExpectation,
          results,
        });

        setStatus(
          "Az A/B teszt és a mentés elkészült."
        );

        return;
      }

      if (evaluationType === "multi-turn") {
        const initialMessage =
          simulatorInitialMessage.trim();

        if (!simulatorPersona.trim()) {
          throw new Error(
            "A szimulált felhasználó personája nem lehet üres."
          );
        }

        if (!simulatorGoal.trim()) {
          throw new Error(
            "A szimulált felhasználó célja nem lehet üres."
          );
        }

        if (!simulatorHiddenConstraints.trim()) {
          throw new Error(
            "A rejtett feltételek mező nem lehet üres."
          );
        }

        if (!initialMessage) {
          throw new Error(
            "A kezdő felhasználói üzenet nem lehet üres."
          );
        }

        const result = await runMultiTurnTest(
          initialMessage,
          normalizedExpectation,
          simulatorMaximumTurns
        );

        setMultiTurnResult(result);

        await saveEvaluation({
          evaluationType: "multi-turn",
          promptVariant,
          knowledgeSourceMode,
          expectedBehavior: normalizedExpectation,
          simulator: {
            persona: simulatorPersona.trim(),
            goal: simulatorGoal.trim(),
            hiddenConstraints:
              simulatorHiddenConstraints.trim(),
            initialMessage,
            maximumTurns: simulatorMaximumTurns,
            model: result.simulatorModel,
            stopReason: result.stopReason,
          },
          turns: result.turns,
          messages: result.messages,
          totalResponseTime: result.totalResponseTime,
          finalEvaluation: result.finalEvaluation,
        });

        setStatus(
          "A multi-turn teszt és a mentés elkészült."
        );

        return;
      }

      if (evaluationType === "rag") {
        if (!normalizedQuestion) {
          throw new Error(
            "A tesztkérdés nem lehet üres."
          );
        }

        if (
          minimumSimilarity < 0 ||
          minimumSimilarity > 1
        ) {
          throw new Error(
            "A minimális hasonlóság 0 és 1 közötti érték legyen."
          );
        }

        setStatus("A RAG-teszt fut...");

        const evaluation =
          await runAssistantAndJudge(
            promptVariant,
            knowledgeSourceMode,
            normalizedQuestion,
            normalizedExpectation
          );

        const ragCheck = evaluateRagResult({
          sources: evaluation.sources,
          resultCount: evaluation.resultCount,
          contextCount: evaluation.contextCount,
          expectedSource: expectedSource.trim(),
          minimumSimilarity,
        });

        const completedRagResult = {
          evaluation,
          ragCheck,
          expectedSource: expectedSource.trim(),
          minimumSimilarity,
        };

        setRagResult(completedRagResult);

        await saveEvaluation({
          evaluationType: "rag",
          knowledgeSourceMode,
          question: normalizedQuestion,
          expectedBehavior: normalizedExpectation,
          expectedSource: expectedSource.trim(),
          minimumSimilarity,
          evaluation,
          ragCheck,
        });

        setStatus(
          "A RAG-szintű teszt és a mentés elkészült."
        );

        return;
      }

      throw new Error(
        "Ez a teszttípus még nem használható."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ismeretlen hiba történt."
      );

      setStatus("");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          Automatikus AI-evaluáció
        </p>

        <h1>Evaluációs Központ</h1>

        <p>
          Single-turn, A/B, Multi-turn és RAG-szintű
          tesztelés automatikus értékeléssel.
        </p>
      </header>

      <section className={styles.panel}>
        <h2>Tesztbeállítások</h2>

        <label className={styles.field}>
          <span>Teszttípus</span>

          <select
            value={evaluationType}
            onChange={(event) =>
              setEvaluationType(
                event.target.value as EvaluationType
              )
            }
            disabled={isRunning}
          >
            <option value="single-turn">
              Single-turn evaluáció
            </option>

            <option value="ab-test">
              Prompt A/B teszt
            </option>

            <option value="multi-turn">
              Multi-turn evaluáció
            </option>

            <option value="rag">
              RAG-szintű evaluáció
            </option>
          </select>
        </label>

        {evaluationType !== "ab-test" && (
          <label className={styles.field}>
            <span>System prompt</span>

            <select
              value={promptVariant}
              onChange={(event) =>
                setPromptVariant(
                  event.target.value as PromptVariant
                )
              }
              disabled={isRunning}
            >
              <option value="strict">
                Szigorúan forráshű
              </option>

              <option value="conversational">
                Beszélgető és segítő
              </option>
              <option value="default">
                Alapértelmezett modellviselkedés
              </option>
            </select>
            <small
              style={{
                display: "block",
                marginTop: "6px",
                color: "#64748b",
                fontSize: "0.72rem",
                lineHeight: 1.4,
              }}
            >
              A system promptok helye: lib/system-prompts.ts
              <br />
              STRICT_SYSTEM_PROMPT, CONVERSATIONAL_SYSTEM_PROMPT és default mód
              <br />
              Tudásforrás-szabályok: lib/knowledge-source.ts
            </small>
          </label>
        )}

        {evaluationType === "ab-test" && (
          <div className={styles.answer}>
            <strong>A/B teszt</strong>

            <p>
              A kérdés mindkét rendszerprompttal
              automatikusan lefut.
            </p>
          </div>
        )}

        <label className={styles.field}>
          <span>Tudásforrás</span>
          <select
            value={knowledgeSourceMode}
            onChange={(event) =>
              setKnowledgeSourceMode(
                event.target.value as KnowledgeSourceMode
              )
            }
            disabled={isRunning}
          >
            <option value="documents">
              Csak feltöltött dokumentumok
            </option>
            <option value="model">
              Csak a modell általános tudása
            </option>
            <option value="hybrid">
              Dokumentumok és modell tudása
            </option>
          </select>
          <small
            style={{
              display: "block",
              marginTop: "6px",
              color: "#64748b",
              fontSize: "0.72rem",
              lineHeight: 1.4,
            }}
          >
            A RAG-szintű méréshez a „Csak feltöltött dokumentumok” mód ajánlott.
          </small>
        </label>

        {evaluationType !== "multi-turn" && (
          <label className={styles.field}>
            <span>Tesztkérdés</span>

            <textarea
              value={question}
              onChange={(event) =>
                setQuestion(event.target.value)
              }
              rows={4}
              maxLength={2000}
              disabled={isRunning}
            />
          </label>
        )}

        {evaluationType === "multi-turn" && (
          <div>
            <div className={styles.answer}>
              <strong>Adaptív Multi-turn szimuláció</strong>

              <p>
                Az első üzenet után a szimulált felhasználó
                mindig az asszisztens legutóbbi válaszára
                reagál. A rejtett feltételeket fokozatosan közli.
              </p>
            </div>

            <label className={styles.field}>
              <span>Felhasználói persona</span>

              <textarea
                value={simulatorPersona}
                onChange={(event) =>
                  setSimulatorPersona(event.target.value)
                }
                rows={3}
                maxLength={2000}
                disabled={isRunning}
              />
            </label>

            <label className={styles.field}>
              <span>Felhasználó célja</span>

              <textarea
                value={simulatorGoal}
                onChange={(event) =>
                  setSimulatorGoal(event.target.value)
                }
                rows={2}
                maxLength={2000}
                disabled={isRunning}
              />
            </label>

            <label className={styles.field}>
              <span>Rejtett feltételek</span>

              <textarea
                value={simulatorHiddenConstraints}
                onChange={(event) =>
                  setSimulatorHiddenConstraints(
                    event.target.value
                  )
                }
                rows={2}
                maxLength={2000}
                disabled={isRunning}
              />
            </label>

            <label className={styles.field}>
              <span>Kezdő felhasználói üzenet</span>

              <textarea
                value={simulatorInitialMessage}
                onChange={(event) =>
                  setSimulatorInitialMessage(
                    event.target.value
                  )
                }
                rows={2}
                maxLength={2000}
                disabled={isRunning}
              />
            </label>

            <label className={styles.field}>
              <span>Maximális fordulók száma</span>

              <select
                value={simulatorMaximumTurns}
                onChange={(event) =>
                  setSimulatorMaximumTurns(
                    Number(event.target.value)
                  )
                }
                disabled={isRunning}
              >
                <option value={2}>2 forduló</option>
                <option value={3}>3 forduló</option>
                <option value={4}>4 forduló</option>
                <option value={5}>5 forduló</option>
              </select>
            </label>
          </div>
        )}

        {evaluationType === "rag" && (
          <>
            <label className={styles.field}>
              <span>
                Elvárt dokumentum neve
              </span>

              <input
                type="text"
                value={expectedSource}
                onChange={(event) =>
                  setExpectedSource(event.target.value)
                }
                placeholder="Például: smt_hibakereses.pdf"
                disabled={isRunning}
              />
            </label>

            <label className={styles.field}>
              <span>
                Minimális hasonlóság:{" "}
                {minimumSimilarity.toFixed(2)}
              </span>

              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={minimumSimilarity}
                onChange={(event) =>
                  setMinimumSimilarity(
                    Number(event.target.value)
                  )
                }
                disabled={isRunning}
              />
            </label>
          </>
        )}

        <label className={styles.field}>
          <span>Elvárt viselkedés</span>

          <textarea
            value={expectedBehavior}
            onChange={(event) =>
              setExpectedBehavior(event.target.value)
            }
            rows={3}
            maxLength={2000}
            disabled={isRunning}
          />
        </label>

        <button
          className={styles.runButton}
          type="button"
          onClick={runTest}
          disabled={isRunning}
        >
          {isRunning
            ? "Teszt futtatása..."
            : "Teszt indítása"}
        </button>

        {status && (
          <p className={styles.status}>
            {status}
          </p>
        )}

        {savedFileName && (
          <p className={styles.savedFile}>
            Mentett eredmény:{" "}
            <strong>{savedFileName}</strong>
          </p>
        )}
      </section>

      {error && (
        <section className={styles.error}>
          <strong>Hiba:</strong> {error}
        </section>
      )}

      {singleResult && (
        <ResultPanel
          title="Single-turn eredmény"
          result={singleResult}
          showMultiTurnScores={false}
        />
      )}

      {abResults.length === 2 && (
        <>
          <section className={styles.panel}>
            <h2>A/B összehasonlítás</h2>

            <div className={styles.metrics}>
              <Metric
                label="A változat"
                value={`${abResults[0].judge.overallScore}/5`}
              />

              <Metric
                label="B változat"
                value={`${abResults[1].judge.overallScore}/5`}
              />

              <Metric
                label="Pontszámkülönbség"
                value={(
                  abResults[1].judge.overallScore -
                  abResults[0].judge.overallScore
                ).toFixed(2)}
              />

              <Metric
                label="Gyorsabb változat"
                value={
                  abResults[0].responseTime <=
                  abResults[1].responseTime
                    ? "A változat"
                    : "B változat"
                }
              />
            </div>
          </section>

          <ResultPanel
            title="A változat: Szigorúan forráshű"
            result={abResults[0]}
            showMultiTurnScores={false}
          />

          <ResultPanel
            title="B változat: Beszélgető és segítő"
            result={abResults[1]}
            showMultiTurnScores={false}
          />
        </>
      )}

      {multiTurnResult && (
        <>
          <section className={styles.panel}>
            <h2>Multi-turn beszélgetés</h2>

            <div className={styles.metrics}>
              <Metric
                label="Fordulók száma"
                value={String(
                  multiTurnResult.turns.length
                )}
              />

              <Metric
                label="Teljes válaszidő"
                value={`${(
                  multiTurnResult.totalResponseTime /
                  1000
                ).toFixed(2)} s`}
              />

              <Metric
                label="Kontextusmegőrzés"
                value={
                  `${multiTurnResult.finalEvaluation.judge.contextRetention}/5`
                }
              />

              <Metric
                label="Következetesség"
                value={
                  `${multiTurnResult.finalEvaluation.judge.consistency}/5`
                }
              />
            </div>

            <div className={styles.answer}>
              <h3>Szimuláció befejezése</h3>
              <p>{multiTurnResult.stopReason}</p>
              <p>
                <strong>User simulator modell:</strong>{" "}
                {multiTurnResult.simulatorModel ||
                  "Nem volt további szimulált forduló"}
              </p>
            </div>

            {multiTurnResult.turns.map(
              (turn, index) => (
                <div
                  className={styles.answer}
                  key={index}
                >
                  <h3>{index + 1}. forduló</h3>

                  <p>
                    <strong>Felhasználó:</strong>{" "}
                    {turn.user}
                  </p>

                  <p>
                    <strong>Asszisztens:</strong>{" "}
                    {turn.assistant}
                  </p>
                </div>
              )
            )}
          </section>

          <ResultPanel
            title="Multi-turn összesített értékelés"
            result={multiTurnResult.finalEvaluation}
            showMultiTurnScores
          />
        </>
      )}

      {ragResult && (
        <>
          <section className={styles.panel}>
            <h2>RAG-szintű ellenőrzés</h2>

            <div className={styles.metrics}>
              <Metric
                label="Keresési találat"
                value={
                  ragResult.ragCheck.hasResults
                    ? "Igen"
                    : "Nem"
                }
              />

              <Metric
                label="RAG-kontextus"
                value={
                  ragResult.ragCheck.hasContext
                    ? "Igen"
                    : "Nem"
                }
              />

              <Metric
                label="Elvárt forrás"
                value={
                  ragResult.ragCheck.expectedSourceFound
                    ? "Megtalálva"
                    : "Nincs találat"
                }
              />

              <Metric
                label="Legjobb hasonlóság"
                value={
                  ragResult.ragCheck.bestSimilarity.toFixed(3)
                }
              />

              <Metric
                label="Minimum küszöb"
                value={
                  ragResult.minimumSimilarity.toFixed(3)
                }
              />
            </div>

            <div
              className={
                ragResult.ragCheck.passed
                  ? styles.passed
                  : styles.failed
              }
            >
              {ragResult.ragCheck.passed
                ? "A RAG-teszt megfelelt"
                : "A RAG-teszt nem felelt meg"}
            </div>

            <div className={styles.answer}>
              <h3>Szabályalapú értékelés</h3>

              <p>
                {ragResult.ragCheck.explanation}
              </p>

              <p>
                <strong>Elvárt dokumentum:</strong>{" "}
                {ragResult.expectedSource ||
                  "Nem volt külön megadva"}
              </p>
            </div>
          </section>

          <ResultPanel
            title="RAG-teszt asszisztensértékelése"
            result={ragResult.evaluation}
            showMultiTurnScores={false}
          />
        </>
      )}
            {savedFileName && (
        <HumanReviewForm
          key={savedFileName}
          evaluationFileName={savedFileName}
          judgePassed={currentJudgePassed}
        />
      )}
    </div>
  );
}

function ResultPanel({
  title,
  result,
  showMultiTurnScores,
}: {
  title: string;
  result: EvaluationResult;
  showMultiTurnScores: boolean;
}) {
  return (
    <>
      <section className={styles.panel}>
        <h2>{title}</h2>

        <div className={styles.metrics}>
          <Metric
            label="Válaszidő"
            value={`${(
              result.responseTime / 1000
            ).toFixed(2)} s`}
          />

          <Metric
            label="Válaszmodell"
            value={result.answerModel}
          />

          <Metric
            label="Prompt"
            value={result.promptVariant}
          />
          <Metric
            label="Tudásforrás"
            value={result.knowledgeSourceMode}
          />

          <Metric
            label="Keresési találatok"
            value={String(result.resultCount)}
          />

          <Metric
            label="Kontextusok"
            value={String(result.contextCount)}
          />
        </div>

        <div className={styles.answer}>
          <h3>Asszisztens válasza</h3>
          <p>{result.answer}</p>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>LLM as Judge értékelés</h2>

        <div className={styles.metrics}>
          <Metric
            label="Relevancia"
            value={`${result.judge.relevance}/5`}
          />

          <Metric
            label="Utasításkövetés"
            value={
              `${result.judge.instructionFollowing}/5`
            }
          />

          <Metric
            label="Megalapozottság"
            value={`${result.judge.groundedness}/5`}
          />

          <Metric
            label="Érthetőség"
            value={`${result.judge.clarity}/5`}
          />

          {showMultiTurnScores && (
            <>
              <Metric
                label="Kontextusmegőrzés"
                value={
                  `${result.judge.contextRetention}/5`
                }
              />

              <Metric
                label="Következetesség"
                value={`${result.judge.consistency}/5`}
              />
            </>
          )}

          <Metric
            label="Összpontszám"
            value={`${result.judge.overallScore}/5`}
          />
        </div>

        <div
          className={
            result.judge.passed
              ? styles.passed
              : styles.failed
          }
        >
          {result.judge.passed
            ? "Megfelelt"
            : "Nem felelt meg"}
        </div>

        <div className={styles.answer}>
          <h3>Nem alátámasztott állítások</h3>

          {result.judge.unsupportedClaims.length === 0 ? (
            <p>
              A Judge nem talált a forrásokkal nem
              alátámasztott tényszerű állítást.
            </p>
          ) : (
            <ul className={styles.sourceList}>
              {result.judge.unsupportedClaims.map(
                (claim, index) => (
                  <li key={`${index}-${claim}`}>
                    {claim}
                  </li>
                )
              )}
            </ul>
          )}
        </div>

        <div className={styles.answer}>
          <h3>A bíró indoklása</h3>

          <p>{result.judge.explanation}</p>

          <p>
            <strong>Judge modell:</strong>{" "}
            {result.judgeModel}
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>RAG-források</h2>

        {result.sources.length === 0 ? (
          <p>Nem volt releváns keresési találat.</p>
        ) : (
          <ul className={styles.sourceList}>
            {result.sources.map((source) => (
              <li key={source.chunkId}>
                <strong>
                  {source.documentTitle ||
                    source.originalFilename}
                </strong>

                <span>
                  {" "}
                  | chunk: {source.chunkIndex}
                  {" | "}
                  hasonlóság:{" "}
                  {source.similarity.toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}