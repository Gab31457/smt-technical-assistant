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
  | "conversational";

interface ChatSource {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
  content?: string;
}

type ChatMessageRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  sources?: ChatSource[];
  systemPromptVariant?: SystemPromptVariant;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface SuccessfulChatResponse {
  success: true;
  chatSessionId: string | null;
  message: string;
  answer: string;
  model: string;
  systemPromptVariant: SystemPromptVariant;
  retrieval: {
    resultCount: number;
    contextCount: number;
    limit: number;
    minimumSimilarity: number;
  };
  sources: ChatSource[];
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

type ChatResponse =
  | SuccessfulChatResponse
  | FailedApiResponse;

function createMessageId(): string {
  return crypto.randomUUID();
}

function formatSimilarity(similarity: number): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

function getSystemPromptLabel(
  variant: SystemPromptVariant
): string {
  return variant === "conversational"
    ? "Beszélgető és segítő"
    : "Szigorúan forráshű";
}

export default function ChatInterface() {
  const [inputValue, setInputValue] = useState("");

  const [systemPromptVariant, setSystemPromptVariant] =
    useState<SystemPromptVariant>("strict");

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [sessions, setSessions] =
    useState<ChatSession[]>([]);

  const [activeSessionId, setActiveSessionId] =
    useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
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
    const timeoutId = window.setTimeout(() => {
      void loadSessions();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadSessions]);

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
      const response = await fetch("/api/chat", {
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
        }),
      });

      const responseBody =
        (await response.json()) as ChatResponse;

      if (
        !response.ok ||
        responseBody.success === false
      ) {
        const apiErrorMessage =
          responseBody.success === false
            ? responseBody.error.message
            : "A szerver nem tudta feldolgozni a kérést.";

        throw new Error(apiErrorMessage);
      }

      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: responseBody.answer,
        sources: responseBody.sources,
        systemPromptVariant:
          responseBody.systemPromptVariant,
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);

      await refreshSessionList();
    } catch (error) {
      setMessages((currentMessages) =>
        currentMessages.filter(
          (message) => message.id !== userMessage.id
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

        <button
          type="button"
          className={styles.newSessionButton}
          onClick={() => void createSession()}
          disabled={isLoadingSessions || isLoading}
        >
          Új beszélgetés
        </button>
      </div>

      <div className={styles.chatHeader}>
        <div>
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
                  value === "conversational"
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
            </select>

            <p className={styles.promptLocation}>
              A system promptok helye: lib/system-prompts.ts
              <br />
              STRICT_SYSTEM_PROMPT és CONVERSATIONAL_SYSTEM_PROMPT
            </p>
          </div>

          <div className={styles.statusBadge}>
            Dokumentumalapú válaszadás
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

              {message.sources &&
                message.sources.length > 0 && (
                  <div className={styles.sourceSection}>
                    <div className={styles.sourceTitle}>
                      Felhasznált források
                    </div>
                    <ul className={styles.sourceList}>
                      {message.sources.map((source) => (
                        <li key={source.chunkId}>
                          <span>
                            {source.documentTitle ||
                              source.originalFilename}
                          </span>
                          <span className={styles.similarity}>
                            {formatSimilarity(
                              source.similarity
                            )}
                          </span>
                        </li>
                      ))}
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
