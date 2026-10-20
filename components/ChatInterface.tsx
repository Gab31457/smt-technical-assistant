"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import type {
  FormEvent,
  KeyboardEvent,
} from "react";
import styles from "./ChatInterface.module.css";

type SystemPromptVariant =
  | "strict"
  | "conversational"
  | "default";

type KnowledgeSourceMode =
  | "documents"
  | "model"
  | "hybrid";

type DocumentSearchScope = "all" | "selected";

interface ChatSource {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
  sourceType?: string | null;
  extractionMethod?: string | null;
  pageNumber?: number | null;
  worksheetName?: string | null;
  rowStart?: number | null;
  rowEnd?: number | null;
  content?: string;
}

interface ChatMonitoring {
  firstTokenMs: number;
  queryGenerationMs: number;
  vectorSearchMs: number;
  contextBuildingMs: number;
  generationMs: number;
  totalResponseMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  retrievedChunkCount: number;
}

type ChatMessageRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  sources?: ChatSource[];
  systemPromptVariant?: SystemPromptVariant;
  monitoring?: ChatMonitoring;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface SearchableDocument {
  id: string;
  originalFilename: string;
  title: string | null;
  mimeType: string;
  status: "uploaded" | "processing" | "completed" | "failed";
}

interface DocumentListResponse {
  success: true;
  documents: SearchableDocument[];
}

interface SuccessfulChatResponse {
  success: true;
  chatSessionId: string | null;
  message: string;
  answer: string;
  model: string;
  systemPromptVariant: SystemPromptVariant;
  knowledgeSourceMode: KnowledgeSourceMode;
  retrieval: {
    resultCount: number;
    contextCount: number;
    limit: number;
    minimumSimilarity: number;
  };
  sources: ChatSource[];
  monitoring: ChatMonitoring;
}

interface FailedApiResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

interface SessionListResponse {
  success: true;
  sessions: ChatSession[];
}

interface SessionCreateResponse {
  success: true;
  session: ChatSession;
}

interface SessionDetailResponse {
  success: true;
  session: ChatSession;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    sources: ChatSource[];
    createdAt: string;
  }>;
}

type ChatStreamEvent =
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "first-token";
      firstTokenMs: number;
    }
  | {
      type: "complete";
      data: SuccessfulChatResponse;
    }
  | {
      type: "error";
      message: string;
    };

function createMessageId(): string {
  return crypto.randomUUID();
}

function formatSimilarity(similarity: number): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

function formatSourceLocation(source: ChatSource): string | null {
  const parts: string[] = [];

  if (source.pageNumber !== null && source.pageNumber !== undefined) {
    parts.push(`${source.pageNumber}. oldal`);
  }
  if (source.worksheetName) {
    parts.push(`${source.worksheetName} munkalap`);
  }
  if (
    source.rowStart !== null &&
    source.rowStart !== undefined &&
    source.rowEnd !== null &&
    source.rowEnd !== undefined
  ) {
    parts.push(
      source.rowStart === source.rowEnd
        ? `${source.rowStart}. sor`
        : `${source.rowStart}-${source.rowEnd}. sor`
    );
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

interface GroupedChatSource {
  key: string;
  documentId: string;
  originalFilename: string;
  documentTitle: string | null;
  bestSimilarity: number;
  chunkCount: number;
  location: string | null;
}

function createSourceGroupKey(source: ChatSource): string {
  const location = formatSourceLocation(source);

  if (location) {
    return `${source.documentId}::${location}`;
  }

  return source.documentId;
}

function groupChatSources(
  sources: ChatSource[]
): GroupedChatSource[] {
  const groupedSources = new Map<string, GroupedChatSource>();

  for (const source of sources) {
    const key = createSourceGroupKey(source);
    const existingSource = groupedSources.get(key);

    if (!existingSource) {
      groupedSources.set(key, {
        key,
        documentId: source.documentId,
        originalFilename: source.originalFilename,
        documentTitle: source.documentTitle,
        bestSimilarity: source.similarity,
        chunkCount: 1,
        location: formatSourceLocation(source),
      });
      continue;
    }

    existingSource.chunkCount += 1;
    existingSource.bestSimilarity = Math.max(
      existingSource.bestSimilarity,
      source.similarity
    );
  }

  return [...groupedSources.values()].sort(
    (firstSource, secondSource) =>
      secondSource.bestSimilarity -
      firstSource.bestSimilarity
  );
}

function getSystemPromptLabel(
  variant: SystemPromptVariant
): string {
  if (variant === "conversational") {
    return "Beszélgető és segítő";
  }

  if (variant === "default") {
    return "Alapértelmezett modellviselkedés";
  }

  return "Szigorúan forráshű";
}

export default function ChatInterface() {
  const [inputValue, setInputValue] = useState("");

  const [systemPromptVariant, setSystemPromptVariant] =
    useState<SystemPromptVariant>("strict");

  const [knowledgeSourceMode, setKnowledgeSourceMode] =
    useState<KnowledgeSourceMode>("documents");

  const [documentSearchScope, setDocumentSearchScope] =
    useState<DocumentSearchScope>("all");
  const [searchableDocuments, setSearchableDocuments] =
    useState<SearchableDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] =
    useState<string[]>([]);

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [sessions, setSessions] =
    useState<ChatSession[]>([]);

  const [activeSessionId, setActiveSessionId] =
    useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isDeletingSession, setIsDeletingSession] =
    useState(false);
  const [isLoadingSessions, setIsLoadingSessions] =
    useState(true);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const loadSession = useCallback(
    async (sessionId: string): Promise<void> => {
      setErrorMessage(null);

      try {
        const response = await fetch(
          `/api/chat-sessions/${sessionId}`,
          { cache: "no-store" }
        );

        const responseBody =
          (await response.json()) as
            | SessionDetailResponse
            | FailedApiResponse;

        if (
          !response.ok ||
          responseBody.success === false
        ) {
          const message =
            responseBody.success === false
              ? responseBody.error.message
              : "A beszélgetés betöltése sikertelen.";

          throw new Error(message);
        }

        const loadedMessages: ChatMessage[] =
          responseBody.messages
            .filter(
              (message) =>
                message.role === "user" ||
                message.role === "assistant"
            )
            .map((message) => ({
              id: message.id,
              role: message.role as ChatMessageRole,
              content: message.content,
              sources: message.sources,
            }));

        setActiveSessionId(sessionId);
        setMessages(loadedMessages);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Ismeretlen hiba történt."
        );
      }
    },
    []
  );

  const createSession = useCallback(
    async (): Promise<string | null> => {
      setErrorMessage(null);

      try {
        const response = await fetch(
          "/api/chat-sessions",
          { method: "POST" }
        );

        const responseBody =
          (await response.json()) as
            | SessionCreateResponse
            | FailedApiResponse;

        if (
          !response.ok ||
          responseBody.success === false
        ) {
          const message =
            responseBody.success === false
              ? responseBody.error.message
              : "Az új beszélgetés létrehozása sikertelen.";

          throw new Error(message);
        }

        setSessions((currentSessions) => [
          responseBody.session,
          ...currentSessions,
        ]);
        setActiveSessionId(responseBody.session.id);
        setMessages([]);

        return responseBody.session.id;
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Ismeretlen hiba történt."
        );
        return null;
      }
    },
    []
  );

  const loadSessions = useCallback(
    async (): Promise<void> => {
      setIsLoadingSessions(true);
      setErrorMessage(null);

      try {
        const response = await fetch(
          "/api/chat-sessions",
          { cache: "no-store" }
        );

        const responseBody =
          (await response.json()) as
            | SessionListResponse
            | FailedApiResponse;

        if (
          !response.ok ||
          responseBody.success === false
        ) {
          const message =
            responseBody.success === false
              ? responseBody.error.message
              : "A beszélgetések betöltése sikertelen.";

          throw new Error(message);
        }

        setSessions(responseBody.sessions);

        if (responseBody.sessions.length > 0) {
          await loadSession(responseBody.sessions[0].id);
        } else {
          await createSession();
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Ismeretlen hiba történt."
        );
      } finally {
        setIsLoadingSessions(false);
      }
    },
    [createSession, loadSession]
  );

  useEffect(() => {
    async function loadSearchableDocuments(): Promise<void> {
      try {
        const response = await fetch("/api/documents", {
          cache: "no-store",
        });
        const responseBody =
          (await response.json()) as
            | DocumentListResponse
            | FailedApiResponse;

        if (response.ok && responseBody.success) {
          setSearchableDocuments(
            responseBody.documents.filter(
              (document) => document.status === "completed"
            )
          );
        }
      } catch (error) {
        console.error("A dokumentumlista betöltése sikertelen:", error);
      }
    }

    void loadSearchableDocuments();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSessions();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadSessions]);

  async function deleteActiveSession(): Promise<void> {
    if (!activeSessionId || isLoading || isDeletingSession) {
      return;
    }

    const activeSession = sessions.find(
      (session) => session.id === activeSessionId
    );

    const shouldDelete = window.confirm(
      `Biztosan törli ezt a beszélgetést?

${
        activeSession?.title ?? "Kiválasztott beszélgetés"
      }

A beszélgetés összes üzenete véglegesen törlődik.`
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingSession(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/chat-sessions/${activeSessionId}`,
        { method: "DELETE" }
      );

      const responseBody =
        (await response.json()) as
          | {
              success: true;
              deletedSessionId: string;
            }
          | FailedApiResponse;

      if (!response.ok || responseBody.success === false) {
        const message =
          responseBody.success === false
            ? responseBody.error.message
            : "A beszélgetés törlése sikertelen.";

        throw new Error(message);
      }

      const remainingSessions = sessions.filter(
        (session) => session.id !== activeSessionId
      );

      setSessions(remainingSessions);
      setMessages([]);
      setActiveSessionId(null);

      if (remainingSessions.length > 0) {
        await loadSession(remainingSessions[0].id);
      } else {
        await createSession();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt."
      );
    } finally {
      setIsDeletingSession(false);
    }
  }

  async function refreshSessionList(): Promise<void> {
    const response = await fetch(
      "/api/chat-sessions",
      { cache: "no-store" }
    );

    const responseBody =
      (await response.json()) as
        | SessionListResponse
        | FailedApiResponse;

    if (response.ok && responseBody.success) {
      setSessions(responseBody.sessions);
    }
  }

  async function sendMessage(): Promise<void> {
    const normalizedMessage = inputValue.trim();

    if (
      documentSearchScope === "selected" &&
      knowledgeSourceMode !== "model" &&
      selectedDocumentIds.length === 0
    ) {
      setErrorMessage(
        "A kiválasztott dokumentumok keresési tartományhoz jelöljön ki legalább egy dokumentumot."
      );
      return;
    }

    if (normalizedMessage.length === 0 || isLoading) {
      return;
    }

    let sessionId = activeSessionId;

    if (!sessionId) {
      sessionId = await createSession();
    }

    if (!sessionId) {
      return;
    }

    const requestedPromptVariant = systemPromptVariant;
    const requestedKnowledgeSourceMode = knowledgeSourceMode;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: normalizedMessage,
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);
    setInputValue("");
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const assistantMessageId = createMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        systemPromptVariant: requestedPromptVariant,
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);

      const response = await fetch("/api/chat-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatSessionId: sessionId,
          message: normalizedMessage,
          limit: 5,
          minimumSimilarity: 0.2,
          systemPromptVariant: requestedPromptVariant,
          knowledgeSourceMode: requestedKnowledgeSourceMode,
          selectedDocumentIds:
            documentSearchScope === "selected"
              ? selectedDocumentIds
              : [],
        }),
      });

      if (!response.ok || !response.body) {
        const failedResponse =
          (await response.json()) as FailedApiResponse;
        throw new Error(
          failedResponse.success === false
            ? failedResponse.error.message
            : "A szerver nem tudta elindítani a streamelt választ."
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completedResponse: SuccessfulChatResponse | null = null;

      async function processLine(line: string): Promise<void> {
        if (line.trim().length === 0) {
          return;
        }

        const event = JSON.parse(line) as ChatStreamEvent;

        if (event.type === "delta") {
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: message.content + event.delta,
                  }
                : message
            )
          );
          return;
        }

        if (event.type === "first-token") {
          return;
        }

        if (event.type === "error") {
          throw new Error(event.message);
        }

        completedResponse = event.data;
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: event.data.answer,
                  sources: event.data.sources,
                  systemPromptVariant:
                    event.data.systemPromptVariant,
                  monitoring: event.data.monitoring,
                }
              : message
          )
        );
      }

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          await processLine(line);
        }

        if (done) {
          break;
        }
      }

      if (buffer.trim().length > 0) {
        await processLine(buffer);
      }

      if (!completedResponse) {
        throw new Error(
          "A streamelt válasz befejező eseménye nem érkezett meg."
        );
      }

      await refreshSessionList();
    } catch (error) {
      setMessages((currentMessages) =>
        currentMessages.filter(
          (message) =>
            message.id !== userMessage.id &&
            message.content.length > 0
        )
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): void {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <section className={styles.chatContainer}>
      <div className={styles.sessionBar}>
        <div className={styles.sessionControls}>
          <label
            className={styles.sessionLabel}
            htmlFor="chat-session"
          >
            Korábbi beszélgetések
          </label>

          <select
            id="chat-session"
            className={styles.sessionSelect}
            value={activeSessionId ?? ""}
            onChange={(event) =>
              void loadSession(event.target.value)
            }
            disabled={isLoadingSessions || isLoading}
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.sessionActions}>
          <button
            type="button"
            className={styles.deleteSessionButton}
            onClick={() => void deleteActiveSession()}
            disabled={
              !activeSessionId ||
              isLoadingSessions ||
              isLoading ||
              isDeletingSession
            }
          >
            {isDeletingSession
              ? "Törlés..."
              : "Beszélgetés törlése"}
          </button>

          <button
            type="button"
            className={styles.newSessionButton}
            onClick={() => void createSession()}
            disabled={
              isLoadingSessions ||
              isLoading ||
              isDeletingSession
            }
          >
            Új beszélgetés
          </button>
        </div>
      </div>

      <div className={styles.chatHeader}>
        <div className={styles.headerIntro}>
          <h2 className={styles.chatTitle}>
            SMT műszaki asszisztens
          </h2>
          <p className={styles.chatDescription}>
            Kérdezzen a feldolgozott SMT műszaki dokumentumok tartalmáról.
          </p>
        </div>

        <div className={styles.headerControls}>
          <div className={styles.promptSelectorGroup}>
            <label
              className={styles.promptSelectorLabel}
              htmlFor="system-prompt-variant"
            >
              Válaszadási mód
            </label>

            <select
              id="system-prompt-variant"
              className={styles.promptSelector}
              value={systemPromptVariant}
              onChange={(event) => {
                const value = event.target.value;

                if (
                  value === "strict" ||
                  value === "conversational" ||
                  value === "default"
                ) {
                  setSystemPromptVariant(value);
                }
              }}
              disabled={isLoading}
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

          </div>

          <div className={styles.promptSelectorGroup}>
            <label
              className={styles.promptSelectorLabel}
              htmlFor="knowledge-source-mode"
            >
              Tudásforrás
            </label>

            <select
              id="knowledge-source-mode"
              className={styles.promptSelector}
              value={knowledgeSourceMode}
              onChange={(event) => {
                const value = event.target.value;

                if (
                  value === "documents" ||
                  value === "model" ||
                  value === "hybrid"
                ) {
                  setKnowledgeSourceMode(value);
                }
              }}
              disabled={isLoading}
            >
              <option value="documents">Csak feltöltött dokumentumok</option>
              <option value="model">Csak a modell általános tudása</option>
              <option value="hybrid">Dokumentumok és modell tudása</option>
            </select>
          </div>

          {knowledgeSourceMode !== "model" && (
            <div className={styles.promptSelectorGroup}>
              <label
                className={styles.promptSelectorLabel}
                htmlFor="document-search-scope"
              >
                Keresési tartomány
              </label>
              <select
                id="document-search-scope"
                className={styles.promptSelector}
                value={documentSearchScope}
                onChange={(event) =>
                  setDocumentSearchScope(
                    event.target.value as DocumentSearchScope
                  )
                }
                disabled={isLoading}
              >
                <option value="all">
                  Összes feltöltött dokumentum
                </option>
                <option value="selected">
                  Kiválasztott dokumentumok
                </option>
              </select>

              {documentSearchScope === "selected" && (
                <div className={styles.documentPicker}>
                  {searchableDocuments.length === 0 ? (
                    <small>Nincs feldolgozott dokumentum.</small>
                  ) : (
                    searchableDocuments.map((document) => (
                      <label
                        key={document.id}
                        className={styles.documentOption}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocumentIds.includes(document.id)}
                          onChange={(event) => {
                            setSelectedDocumentIds((current) =>
                              event.target.checked
                                ? [...current, document.id]
                                : current.filter((id) => id !== document.id)
                            );
                          }}
                          disabled={isLoading}
                        />
                        <span>
                          {document.title || document.originalFilename}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>Aktív működés</span>
            <div className={styles.statusBadge}>
              {knowledgeSourceMode === "documents"
                ? "Dokumentumalapú válaszadás"
                : knowledgeSourceMode === "model"
                  ? "Általános AI-tudás"
                  : "Dokumentumok + AI-tudás"}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.messageList}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div
              className={styles.emptyStateIcon}
              aria-hidden="true"
            >
              🔧
            </div>
            <h3>Miben segíthetek?</h3>
            <p>Például kérdezheti:</p>
            <ul>
              <li>Mit jelent a dokumentumban szereplő hibakód?</li>
              <li>Milyen ellenőrzéseket kell elvégezni programváltás előtt?</li>
              <li>Hogyan végezhető el a dokumentált karbantartási művelet?</li>
            </ul>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === "user"
                  ? styles.userMessage
                  : styles.assistantMessage
              }
            >
              <div className={styles.messageLabel}>
                {message.role === "user"
                  ? "Ön"
                  : "SMT műszaki asszisztens"}
              </div>

              <div className={styles.messageContent}>
                {message.content}
              </div>

              {message.role === "assistant" &&
                message.systemPromptVariant && (
                  <div className={styles.promptUsed}>
                    Használt válaszadási mód:{" "}
                    {getSystemPromptLabel(
                      message.systemPromptVariant
                    )}
                  </div>
                )}

              {message.role === "assistant" &&
                message.monitoring && (
                  <details className={styles.monitoringPanel}>
                    <summary>Technikai mérési adatok</summary>
                    <div className={styles.monitoringGrid}>
                      <span>Első token</span>
                      <strong>{message.monitoring.firstTokenMs} ms</strong>
                      <span>Keresőkérdés</span>
                      <strong>{message.monitoring.queryGenerationMs} ms</strong>
                      <span>Vektorkeresés</span>
                      <strong>{message.monitoring.vectorSearchMs} ms</strong>
                      <span>Kontextusépítés</span>
                      <strong>{message.monitoring.contextBuildingMs} ms</strong>
                      <span>Válaszgenerálás</span>
                      <strong>{message.monitoring.generationMs} ms</strong>
                      <span>Teljes válaszidő</span>
                      <strong>{message.monitoring.totalResponseMs} ms</strong>
                      <span>Tokenek</span>
                      <strong>
                        {message.monitoring.inputTokens} be /{" "}
                        {message.monitoring.outputTokens} ki /{" "}
                        {message.monitoring.totalTokens} összesen
                      </strong>
                      <span>Becsült költség</span>
                      <strong>
                        {message.monitoring.estimatedCostUsd.toFixed(6)} USD
                      </strong>
                      <span>Forráschunkok</span>
                      <strong>{message.monitoring.retrievedChunkCount}</strong>
                    </div>
                  </details>
                )}

              {message.sources &&
                message.sources.length > 0 && (
                  <div className={styles.sourceSection}>
                    <div className={styles.sourceTitle}>
                      Felhasznált források
                    </div>
                    <ul className={styles.sourceList}>
                      {groupChatSources(message.sources).map(
                        (source) => (
                          <li key={source.key}>
                            <span className={styles.sourceDetails}>
                              <span className={styles.sourceName}>
                                {source.documentTitle ||
                                  source.originalFilename}
                              </span>
                              {source.location && (
                                <small className={styles.sourceLocation}>
                                  {source.location}
                                </small>
                              )}
                              {source.chunkCount > 1 && (
                                <small className={styles.sourceChunkCount}>
                                  {source.chunkCount} felhasznált dokumentumrészlet
                                </small>
                              )}
                            </span>
                            <span className={styles.sourceScoreGroup}>
                              <small>Legjobb egyezés</small>
                              <span className={styles.similarity}>
                                {formatSimilarity(
                                  source.bestSimilarity
                                )}
                              </span>
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </article>
          ))
        )}

        {isLoading && (
          <div className={styles.loadingMessage} role="status">
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span>Az asszisztens válaszol...</span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className={styles.errorMessage} role="alert">
          <strong>Hiba:</strong> {errorMessage}
        </div>
      )}

      <form
        className={styles.inputSection}
        onSubmit={handleSubmit}
      >
        <label
          className={styles.inputLabel}
          htmlFor="chat-message"
        >
          Kérdés
        </label>

        <textarea
          id="chat-message"
          className={styles.chatInput}
          value={inputValue}
          onChange={(event) =>
            setInputValue(event.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Írja be az SMT műszaki dokumentumokkal kapcsolatos kérdését..."
          maxLength={2000}
          rows={3}
          disabled={isLoading || isLoadingSessions}
        />

        <div className={styles.inputFooter}>
          <span className={styles.characterCount}>
            {inputValue.length} / 2000
          </span>

          <button
            className={styles.sendButton}
            type="submit"
            disabled={
              isLoading ||
              isLoadingSessions ||
              inputValue.trim().length === 0
            }
          >
            {isLoading ? "Válasz készül..." : "Küldés"}
          </button>
        </div>
      </form>
    </section>
  );
}
