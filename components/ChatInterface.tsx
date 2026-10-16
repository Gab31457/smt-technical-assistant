"use client";

import { useState } from "react";

import type {
  FormEvent,
  KeyboardEvent,
} from "react";

import type { ChatMessageInput } from "@/lib/chat-types";

import styles from "./ChatInterface.module.css";

// A frontendről kiválasztható system prompt változatok.
type SystemPromptVariant =
  | "strict"
  | "conversational";

// A chatválaszban visszakapott forrás szerkezete.
interface ChatSource {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  originalFilename: string;
  documentTitle: string | null;
  similarity: number;
}

// A chatüzenet lehetséges szerepei.
type ChatMessageRole =
  | "user"
  | "assistant";

// Egy frontendoldali chatüzenet szerkezete.
interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  sources?: ChatSource[];
  systemPromptVariant?: SystemPromptVariant;
}

// A chat API sikeres válaszának szerkezete.
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

// A chat API sikertelen válaszának szerkezete.
interface FailedChatResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

// A két lehetséges API-válasz egyesített típusa.
type ChatResponse =
  | SuccessfulChatResponse
  | FailedChatResponse;

// Egyedi frontendazonosító létrehozása.
function createMessageId(): string {
  return crypto.randomUUID();
}

// A hasonlósági érték százalékos formázása.
//
// Például:
// 0.8234 eredménye 82.3%.
function formatSimilarity(
  similarity: number
): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

// A system prompt magyar megnevezése.
function getSystemPromptLabel(
  variant: SystemPromptVariant
): string {
  if (variant === "conversational") {
    return "Beszélgető és ajánló";
  }

  return "Szigorúan forráshű";
}

// A fő chatkomponens.
export default function ChatInterface() {
  // A felhasználó által éppen szerkesztett kérdés.
  const [inputValue, setInputValue] =
    useState("");

  // A frontend felületén kiválasztott system prompt.
  const [
    systemPromptVariant,
    setSystemPromptVariant,
  ] = useState<SystemPromptVariant>(
    "strict"
  );

  // A beszélgetés üzenetei.
  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  // Jelzi, hogy folyamatban van-e API-kérés.
  const [isLoading, setIsLoading] =
    useState(false);

  // A felhasználónak megjelenített hibaüzenet.
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  // A chatkérdés elküldése.
  async function sendMessage(): Promise<void> {
    const normalizedMessage =
      inputValue.trim();

    // Üres kérdést nem küldünk el.
    // Folyamatban lévő kérés alatt sem indítunk újabbat.
    if (
      normalizedMessage.length === 0 ||
      isLoading
    ) {
      return;
    }

    // A kérés indításakor eltároljuk az aktuálisan
    // kiválasztott promptot.
    //
    // Így akkor is a megfelelő prompt neve kerül
    // a válasz mellé, ha a felhasználó később
    // megváltoztatná a választómező értékét.
    const requestedPromptVariant =
      systemPromptVariant;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: normalizedMessage,
    };

    // A teljes eddigi beszélgetéshez hozzáadjuk
    // az új felhasználói üzenetet.
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

    // A felhasználói üzenetet azonnal megjelenítjük.
    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);

    // A beviteli mezőt kiürítjük.
    setInputValue("");

    // A korábbi hibaüzenetet töröljük.
    setErrorMessage(null);

    // Bekapcsoljuk a betöltési állapotot.
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

      // HTTP-hiba vagy üzleti hiba kezelése.
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

      // Az asszisztens válaszát hozzáadjuk
      // a beszélgetéshez.
      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);
    } catch (error) {
      const readableErrorMessage =
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt.";

      setErrorMessage(
        readableErrorMessage
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Az űrlap elküldésének kezelése.
  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): void {
    // Megakadályozzuk az oldal újratöltését.
    event.preventDefault();

    void sendMessage();
  }

  // Billentyűzetkezelés:
  //
  // Enter: üzenet elküldése.
  // Shift + Enter: új sor létrehozása.
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

  // A kiválasztott prompt biztonságos kezelése.
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
            Receptasszisztens
          </h2>

          <p className={styles.chatDescription}>
            Kérdezz a feldolgozott receptadatbázis tartalmáról.
          </p>
        </div>

        <div className={styles.headerControls}>
          <div className={styles.promptSelectorGroup}>
            <label
              className={styles.promptSelectorLabel}
              htmlFor="system-prompt-variant"
            >
              System prompt
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
                Beszélgető és ajánló
              </option>
            </select>
          </div>

          <div className={styles.statusBadge}>
            RAG + pgvector
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
              🍲
            </div>

            <h3>Miben segíthetek?</h3>

            <p>Például kérdezheted:</p>

            <ul>
              <li>
                Tudsz ajánlani paradicsomos tésztát?
              </li>

              <li>
                Milyen recept tartalmaz fokhagymát és bazsalikomot?
              </li>

              <li>
                Hogyan készül a feltöltött tésztarecept?
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
                  ? "Te"
                  : "AI receptasszisztens"}
              </div>

              <div className={styles.messageContent}>
                {message.content}
              </div>

              {message.role === "assistant" &&
                message.systemPromptVariant && (
                  <div className={styles.promptUsed}>
                    Használt system prompt:{" "}
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
              A receptasszisztens válaszol...
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
          placeholder="Írd be a recepttel kapcsolatos kérdésedet..."
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