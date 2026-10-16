"use client";

import { useState } from "react";
import type {
  FormEvent,
  KeyboardEvent,
} from "react";
import type { ChatMessageInput } from "@/lib/chat-types";
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
}

type ChatMessageRole =
  | "user"
  | "assistant";

interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  sources?: ChatSource[];
  systemPromptVariant?: SystemPromptVariant;
}

interface SuccessfulChatResponse {
  success: true;
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

interface FailedChatResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

type ChatResponse =
  | SuccessfulChatResponse
  | FailedChatResponse;

function createMessageId(): string {
  return crypto.randomUUID();
}

function formatSimilarity(
  similarity: number
): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

function getSystemPromptLabel(
  variant: SystemPromptVariant
): string {
  if (variant === "conversational") {
    return "Beszélgető és segítő";
  }

  return "Szigorúan forráshű";
}

export default function ChatInterface() {
  const [inputValue, setInputValue] =
    useState("");

  const [
    systemPromptVariant,
    setSystemPromptVariant,
  ] = useState<SystemPromptVariant>(
    "strict"
  );

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [isLoading, setIsLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  async function sendMessage(): Promise<void> {
    const normalizedMessage =
      inputValue.trim();

    if (
      normalizedMessage.length === 0 ||
      isLoading
    ) {
      return;
    }

    const requestedPromptVariant =
      systemPromptVariant;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: normalizedMessage,
    };

    const conversationMessages: ChatMessageInput[] = [
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: userMessage.role,
        content: userMessage.content,
      },
    ];

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);

    setInputValue("");
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch(
        "/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            messages: conversationMessages,
            limit: 5,
            minimumSimilarity: 0.2,
            systemPromptVariant:
              requestedPromptVariant,
          }),
        }
      );

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
    } catch (error) {
      const readableErrorMessage =
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt.";

      setErrorMessage(readableErrorMessage);
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
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function handlePromptVariantChange(
    value: string
  ): void {
    if (
      value === "strict" ||
      value === "conversational"
    ) {
      setSystemPromptVariant(value);
    }
  }

  return (
    <section className={styles.chatContainer}>
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
              onChange={(event) =>
                handlePromptVariantChange(event.target.value)
              }
              disabled={isLoading}
            >
              <option value="strict">
                Szigorúan forráshű
              </option>
              <option value="conversational">
                Beszélgető és segítő
              </option>
            </select>
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
              <li>
                Mit jelent a dokumentumban szereplő hibakód?
              </li>
              <li>
                Milyen ellenőrzéseket kell elvégezni programváltás előtt?
              </li>
              <li>
                Hogyan végezhető el a dokumentált karbantartási művelet?
              </li>
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
          <div
            className={styles.loadingMessage}
            role="status"
          >
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span>
              Az asszisztens válaszol...
            </span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          className={styles.errorMessage}
          role="alert"
        >
          <strong>Hiba:</strong>{" "}
          {errorMessage}
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
          disabled={isLoading}
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
              inputValue.trim().length === 0
            }
          >
            {isLoading
              ? "Válasz készül..."
              : "Küldés"}
          </button>
        </div>
      </form>
    </section>
  );
}
