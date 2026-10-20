import { NextResponse } from "next/server";

import type { ChatMessageInput } from "@/lib/chat-types";
import { databasePool } from "@/lib/database";
import {
  createMultilingualSearchQueries,
} from "@/lib/openai";
import {
  DEFAULT_KNOWLEDGE_SOURCE_MODE,
  isKnowledgeSourceMode,
} from "@/lib/knowledge-source";
import type {
  KnowledgeSourceMode,
} from "@/lib/knowledge-source";
import { generateRagAnswerStream } from "@/lib/rag";
import {
  isSystemPromptVariant,
} from "@/lib/system-prompts";
import type {
  SystemPromptVariant,
} from "@/lib/system-prompts";
import {
  DEFAULT_VECTOR_SEARCH_OPTIONS,
  searchSimilarChunksForQueriesWithDebug,
} from "@/lib/vector-search";
import { runWithSpan } from "@/lib/telemetry";

export const runtime = "nodejs";

interface ChatRequestBody {
  chatSessionId?: unknown;
  message?: unknown;
  messages?: unknown;
  limit?: unknown;
  minimumSimilarity?: unknown;
  systemPromptVariant?: unknown;
  knowledgeSourceMode?: unknown;
  selectedDocumentIds?: unknown;
}

function parseChatMessages(
  value: unknown
): ChatMessageInput[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const parsedMessages: ChatMessageInput[] = [];

  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null
    ) {
      return null;
    }

    const role = Reflect.get(item, "role");
    const content = Reflect.get(item, "content");

    if (
      role !== "user" &&
      role !== "assistant"
    ) {
      return null;
    }

    if (typeof content !== "string") {
      return null;
    }

    const normalizedContent = content.trim();

    if (
      normalizedContent.length === 0 ||
      normalizedContent.length > 2000
    ) {
      return null;
    }

    parsedMessages.push({
      role,
      content: normalizedContent,
    });
  }

  return parsedMessages;
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();

  try {
    const requestBody =
      (await request.json()) as ChatRequestBody;

    const chatSessionId =
      typeof requestBody.chatSessionId === "string"
        ? requestBody.chatSessionId.trim()
        : "";

    const usesPersistentMemory =
      chatSessionId.length > 0;

    let messages: ChatMessageInput[];

    if (usesPersistentMemory) {
      if (typeof requestBody.message !== "string") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CHAT_MESSAGE_MISSING",
              message: "A message mező megadása kötelező.",
            },
          },
          { status: 400 }
        );
      }

      const normalizedMessage = requestBody.message.trim();

      if (
        normalizedMessage.length === 0 ||
        normalizedMessage.length > 2000
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_CHAT_MESSAGE",
              message:
                "A chatüzenet 1 és 2000 karakter közötti lehet.",
            },
          },
          { status: 400 }
        );
      }

      const sessionResult = await databasePool.query(
        "SELECT id, title FROM chat_sessions WHERE id = $1",
        [chatSessionId]
      );

      if (sessionResult.rowCount === 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CHAT_SESSION_NOT_FOUND",
              message: "A beszélgetés nem található.",
            },
          },
          { status: 404 }
        );
      }

      await databasePool.query(
        `
          INSERT INTO chat_messages (
            chat_session_id,
            role,
            content
          )
          VALUES ($1, 'user', $2)
        `,
        [chatSessionId, normalizedMessage]
      );

      const historyResult = await databasePool.query<{
        role: "user" | "assistant";
        content: string;
      }>(
        `
          SELECT role, content
          FROM chat_messages
          WHERE chat_session_id = $1
            AND role IN ('user', 'assistant')
          ORDER BY created_at ASC, id ASC
        `,
        [chatSessionId]
      );

      messages = historyResult.rows;
    } else if (requestBody.messages !== undefined) {

      const parsedMessages = parseChatMessages(
        requestBody.messages
      );

      if (!parsedMessages) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_CHAT_MESSAGES",
              message:
                "A messages mezőnek érvényes user és assistant üzeneteket kell tartalmaznia. Egy üzenet legfeljebb 2000 karakter lehet.",
            },
          },
          { status: 400 }
        );
      }

      messages = parsedMessages;
    } else if (
      typeof requestBody.message === "string"
    ) {
      const normalizedMessage =
        requestBody.message.trim();

      if (normalizedMessage.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CHAT_MESSAGE_EMPTY",
              message:
                "A chatüzenet nem lehet üres.",
            },
          },
          { status: 400 }
        );
      }

      if (normalizedMessage.length > 2000) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CHAT_MESSAGE_TOO_LONG",
              message:
                "A chatüzenet legfeljebb 2000 karakter hosszú lehet.",
            },
          },
          { status: 400 }
        );
      }

      messages = [
        {
          role: "user",
          content: normalizedMessage,
        },
      ];
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CHAT_MESSAGES_MISSING",
            message:
              "A messages vagy a message mező megadása kötelező.",
          },
        },
        { status: 400 }
      );
    }

    const lastUserMessage = [...messages]
      .reverse()
      .find(
        (chatMessage) =>
          chatMessage.role === "user"
      );

    if (!lastUserMessage) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CHAT_USER_MESSAGE_MISSING",
            message:
              "A beszélgetésnek legalább egy felhasználói üzenetet kell tartalmaznia.",
          },
        },
        { status: 400 }
      );
    }

    const defaultLimit =
      DEFAULT_VECTOR_SEARCH_OPTIONS.limit;

    const parsedLimit = Number(
      requestBody.limit ?? defaultLimit
    );

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 20
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CHAT_LIMIT",
            message:
              "A limit értékének 1 és 20 közötti egész számnak kell lennie.",
          },
        },
        { status: 400 }
      );
    }

    const limit = parsedLimit;

    const defaultMinimumSimilarity =
      DEFAULT_VECTOR_SEARCH_OPTIONS.minimumSimilarity;

    const minimumSimilarity = Number(
      requestBody.minimumSimilarity ??
        defaultMinimumSimilarity
    );

    if (
      !Number.isFinite(minimumSimilarity) ||
      minimumSimilarity < -1 ||
      minimumSimilarity > 1
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              "INVALID_CHAT_SIMILARITY_THRESHOLD",
            message:
              "A minimumSimilarity értékének -1 és 1 között kell lennie.",
          },
        },
        { status: 400 }
      );
    }

    let systemPromptVariant:
      | SystemPromptVariant
      | undefined;

    if (
      requestBody.systemPromptVariant !== undefined
    ) {
      if (
        !isSystemPromptVariant(
          requestBody.systemPromptVariant
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code:
                "INVALID_SYSTEM_PROMPT_VARIANT",
              message:
                "A systemPromptVariant értéke csak strict vagy conversational lehet.",
            },
          },
          { status: 400 }
        );
      }

      systemPromptVariant =
        requestBody.systemPromptVariant;
    }

    let selectedDocumentIds: string[] = [];

    if (requestBody.selectedDocumentIds !== undefined) {
      if (
        !Array.isArray(requestBody.selectedDocumentIds) ||
        !requestBody.selectedDocumentIds.every(
          (value) => typeof value === "string"
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_DOCUMENT_FILTER",
              message:
                "A selectedDocumentIds mező csak dokumentumazonosítókat tartalmazó tömb lehet.",
            },
          },
          { status: 400 }
        );
      }

      selectedDocumentIds = [
        ...new Set(
          requestBody.selectedDocumentIds
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        ),
      ];
    }

    let knowledgeSourceMode: KnowledgeSourceMode =
      DEFAULT_KNOWLEDGE_SOURCE_MODE;

    if (requestBody.knowledgeSourceMode !== undefined) {
      if (!isKnowledgeSourceMode(requestBody.knowledgeSourceMode)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_KNOWLEDGE_SOURCE_MODE",
              message:
                "A knowledgeSourceMode értéke csak documents, model vagy hybrid lehet.",
            },
          },
          { status: 400 }
        );
      }

      knowledgeSourceMode = requestBody.knowledgeSourceMode;
    }

    // Az aktuális kérdés mindig elsődleges. A korábbi felhasználói
    // üzeneteket csak valódi visszautalás esetén használjuk.
    const previousUserContext = messages
      .slice(0, -1)
      .filter(
        (chatMessage) =>
          chatMessage.role === "user"
      )
      .slice(-3)
      .map((chatMessage) => chatMessage.content.trim())
      .filter((content) => content.length > 0)
      .filter(
        (content, index, allContents) =>
          index === 0 ||
          content !== allContents[index - 1]
      )
      .join("\n")
      .slice(0, 3000);

    const queryGenerationResult =
      knowledgeSourceMode === "model"
        ? { value: null, durationMs: 0 }
        : await runWithSpan(
            "chat.query_generation",
            {
              "chat.knowledge_source_mode": knowledgeSourceMode,
              "chat.selected_document_count":
                selectedDocumentIds.length,
            },
            async () => createMultilingualSearchQueries(
              lastUserMessage.content,
              previousUserContext
            )
          );

    const multilingualSearchQueries =
      queryGenerationResult.value;
    const queryGenerationMs =
      queryGenerationResult.durationMs;

    const messagesForAnswer =
      multilingualSearchQueries?.usesPreviousContext === true
        ? messages
        : [lastUserMessage];

    const vectorSearchResult =
      await runWithSpan(
        "rag.vector_search",
        {
          "chat.knowledge_source_mode": knowledgeSourceMode,
          "chat.selected_document_count":
            selectedDocumentIds.length,
          "rag.requested_limit": limit,
        },
        async () =>
          knowledgeSourceMode === "model" ||
          multilingualSearchQueries === null
            ? { results: [], debugGroups: [] }
            : searchSimilarChunksForQueriesWithDebug(
                [
                  multilingualSearchQueries.originalQuery,
                  multilingualSearchQueries.hungarianQuery,
                  multilingualSearchQueries.englishQuery,
                ],
                {
                  limit,
                  minimumSimilarity,
                  documentIds: selectedDocumentIds,
                }
              )
      );

    const multiQuerySearchResponse =
      vectorSearchResult.value;
    const vectorSearchMs =
      vectorSearchResult.durationMs;

    const searchResults = multiQuerySearchResponse.results;

    const isRetrievalDebugEnabled =
      process.env.RAG_RETRIEVAL_DEBUG?.trim().toLowerCase() ===
      "true";

    if (isRetrievalDebugEnabled) {
      console.info(
        "[RAG retrieval debug]",
        JSON.stringify(
          {
            generatedQueries: multilingualSearchQueries,
            selectedDocumentIds,
            minimumSimilarity,
            perQueryResults:
              multiQuerySearchResponse.debugGroups,
            finalResults: searchResults.map((result) => ({
              documentTitle: result.documentTitle,
              originalFilename: result.originalFilename,
              chunkIndex: result.chunkIndex,
              similarity: result.similarity,
              pageNumber: result.pageNumber,
              worksheetName: result.worksheetName,
              rowStart: result.rowStart,
              rowEnd: result.rowEnd,
            })),
          },
          null,
          2
        )
      );
    }

    const sources = searchResults.map(
      (result) => ({
        documentId: result.documentId,
        chunkId: result.chunkId,
        chunkIndex: result.chunkIndex,
        originalFilename: result.originalFilename,
        documentTitle: result.documentTitle,
        similarity: result.similarity,
        sourceType: result.sourceType,
        extractionMethod: result.extractionMethod,
        pageNumber: result.pageNumber,
        worksheetName: result.worksheetName,
        rowStart: result.rowStart,
        rowEnd: result.rowEnd,
        content: result.content,
      })
    );

    const encoder = new TextEncoder();

    function encodeEvent(
      event: Record<string, unknown>
    ): Uint8Array {
      return encoder.encode(`${JSON.stringify(event)}\n`);
    }

    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          try {
            const ragAnswer = await generateRagAnswerStream(
              {
                question: lastUserMessage.content,
                messages: messagesForAnswer,
                searchResults,
                systemPromptVariant,
                knowledgeSourceMode,
              },
              {
                onTextDelta(delta) {
                  controller.enqueue(
                    encodeEvent({
                      type: "delta",
                      delta,
                    })
                  );
                },
                onFirstTextDelta(firstTokenMs) {
                  controller.enqueue(
                    encodeEvent({
                      type: "first-token",
                      firstTokenMs,
                    })
                  );
                },
              }
            );

            if (usesPersistentMemory) {
              await databasePool.query(
                `
                  INSERT INTO chat_messages (
                    chat_session_id,
                    role,
                    content,
                    sources
                  )
                  VALUES ($1, 'assistant', $2, $3::jsonb)
                `,
                [
                  chatSessionId,
                  ragAnswer.answer,
                  JSON.stringify(sources),
                ]
              );

              const sessionResult =
                await databasePool.query<{
                  title: string;
                }>(
                  "SELECT title FROM chat_sessions WHERE id = $1",
                  [chatSessionId]
                );

              if (
                sessionResult.rows[0]?.title ===
                "Új beszélgetés"
              ) {
                const generatedTitle =
                  lastUserMessage.content
                    .replace(/\s+/g, " ")
                    .slice(0, 60);

                await databasePool.query(
                  `
                    UPDATE chat_sessions
                    SET title = $1, updated_at = NOW()
                    WHERE id = $2
                  `,
                  [generatedTitle, chatSessionId]
                );
              } else {
                await databasePool.query(
                  `
                    UPDATE chat_sessions
                    SET updated_at = NOW()
                    WHERE id = $1
                  `,
                  [chatSessionId]
                );
              }
            }

            const totalResponseMs = Math.round(
              performance.now() - requestStartedAt
            );

            controller.enqueue(
              encodeEvent({
                type: "complete",
                data: {
                  success: true,
                  chatSessionId:
                    usesPersistentMemory
                      ? chatSessionId
                      : null,
                  message: lastUserMessage.content,
                  answer: ragAnswer.answer,
                  model: ragAnswer.model,
                  systemPromptVariant:
                    ragAnswer.systemPromptVariant,
                  knowledgeSourceMode:
                    ragAnswer.knowledgeSourceMode,
                  documentFilter: {
                    selectedDocumentIds,
                    isFiltered:
                      selectedDocumentIds.length > 0,
                  },
                  retrieval: {
                    searchQueries:
                      multilingualSearchQueries,
                    resultCount: searchResults.length,
                    contextCount: ragAnswer.contextCount,
                    limit,
                    minimumSimilarity,
                  },
                  monitoring: {
                    firstTokenMs:
                      ragAnswer.firstTokenMs,
                    queryGenerationMs,
                    vectorSearchMs,
                    contextBuildingMs:
                      ragAnswer.contextBuildingMs,
                    generationMs:
                      ragAnswer.generationMs,
                    totalResponseMs,
                    inputTokens:
                      ragAnswer.usage.inputTokens,
                    outputTokens:
                      ragAnswer.usage.outputTokens,
                    totalTokens:
                      ragAnswer.usage.totalTokens,
                    estimatedCostUsd:
                      ragAnswer.estimatedCostUsd,
                    retrievedChunkCount:
                      searchResults.length,
                  },
                  sources,
                },
              })
            );
            controller.close();
          } catch (error) {
            console.error(
              "Streaming RAG chat failed:",
              error
            );
            controller.enqueue(
              encodeEvent({
                type: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Ismeretlen streaming hiba történt.",
              })
            );
            controller.close();
          }
        })();
      },
    });

    return new Response(responseStream, {
      status: 200,
      headers: {
        "Content-Type":
          "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error(
      "Streaming RAG chat request failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RAG_CHAT_STREAM_FAILED",
          message:
            "Az SMT műszaki asszisztens streamelt válaszának elkészítése közben hiba történt.",
        },
      },
      { status: 500 }
    );
  }
}
