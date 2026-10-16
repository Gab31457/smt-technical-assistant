import { NextResponse } from "next/server";

import type { ChatMessageInput } from "@/lib/chat-types";
import { generateRagAnswer } from "@/lib/rag";
import {
  isSystemPromptVariant,
} from "@/lib/system-prompts";
import type {
  SystemPromptVariant,
} from "@/lib/system-prompts";
import {
  DEFAULT_VECTOR_SEARCH_OPTIONS,
  searchSimilarChunks,
} from "@/lib/vector-search";

export const runtime = "nodejs";

interface ChatRequestBody {
  message?: unknown;
  messages?: unknown;
  limit?: unknown;
  minimumSimilarity?: unknown;
  systemPromptVariant?: unknown;
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
  try {
    const requestBody =
      (await request.json()) as ChatRequestBody;

    let messages: ChatMessageInput[];

    if (requestBody.messages !== undefined) {
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

    // A kereséshez csak a legutóbbi legfeljebb
    // négy felhasználói üzenetet használjuk.
    const searchQuery = messages
      .filter(
        (chatMessage) =>
          chatMessage.role === "user"
      )
      .slice(-4)
      .map((chatMessage) => chatMessage.content)
      .join("\n")
      .slice(0, 2000);

    const searchResults =
      await searchSimilarChunks(searchQuery, {
        limit,
        minimumSimilarity,
      });

    // A teljes beszélgetést továbbadjuk a válaszgenerálásnak.
    const ragAnswer = await generateRagAnswer({
      question: lastUserMessage.content,
      messages,
      searchResults,
      systemPromptVariant,
    });

    const sources = searchResults.map(
      (result) => ({
        documentId: result.documentId,
        chunkId: result.chunkId,
        chunkIndex: result.chunkIndex,
        originalFilename:
          result.originalFilename,
        documentTitle: result.documentTitle,
        similarity: result.similarity,

        //A judge számára szükséges tényleges forrásszöveg
        content: result.content,
      })
    );

    return NextResponse.json(
      {
        success: true,
        message: lastUserMessage.content,
        answer: ragAnswer.answer,
        model: ragAnswer.model,
        systemPromptVariant:
          ragAnswer.systemPromptVariant,
        retrieval: {
          resultCount: searchResults.length,
          contextCount: ragAnswer.contextCount,
          limit,
          minimumSimilarity,
        },
        sources,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "RAG chat request failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RAG_CHAT_FAILED",
          message:
            "A receptasszisztens válaszának elkészítése közben hiba történt.",
        },
      },
      { status: 500 }
    );
  }
}
