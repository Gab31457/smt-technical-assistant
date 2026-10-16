import { NextResponse } from "next/server";

import { databasePool } from "@/lib/database";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface ChatSessionRow {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

interface ChatMessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: unknown;
  created_at: Date;
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const sessionResult =
      await databasePool.query<ChatSessionRow>(
        `
          SELECT id, title, created_at, updated_at
          FROM chat_sessions
          WHERE id = $1
        `,
        [id]
      );

    const session = sessionResult.rows[0];

    if (!session) {
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

    const messageResult =
      await databasePool.query<ChatMessageRow>(
        `
          SELECT id, role, content, sources, created_at
          FROM chat_messages
          WHERE chat_session_id = $1
          ORDER BY created_at ASC, id ASC
        `,
        [id]
      );

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.created_at.toISOString(),
        updatedAt: session.updated_at.toISOString(),
      },
      messages: messageResult.rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        sources: row.sources,
        createdAt: row.created_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Chat session loading failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CHAT_SESSION_LOAD_FAILED",
          message: "A beszélgetés betöltése sikertelen.",
        },
      },
      { status: 500 }
    );
  }
}
