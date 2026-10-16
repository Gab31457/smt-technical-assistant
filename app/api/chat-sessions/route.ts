import { NextResponse } from "next/server";

import { databasePool } from "@/lib/database";

export const runtime = "nodejs";

interface ChatSessionRow {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

export async function GET() {
  try {
    const result = await databasePool.query<ChatSessionRow>(
      `
        SELECT id, title, created_at, updated_at
        FROM chat_sessions
        ORDER BY updated_at DESC
      `
    );

    return NextResponse.json({
      success: true,
      sessions: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Chat session list failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CHAT_SESSION_LIST_FAILED",
          message: "A beszélgetések betöltése sikertelen.",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = await databasePool.query<ChatSessionRow>(
      `
        INSERT INTO chat_sessions (title)
        VALUES ($1)
        RETURNING id, title, created_at, updated_at
      `,
      ["Új beszélgetés"]
    );

    const row = result.rows[0];

    return NextResponse.json(
      {
        success: true,
        session: {
          id: row.id,
          title: row.title,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Chat session creation failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CHAT_SESSION_CREATE_FAILED",
          message: "Az új beszélgetés létrehozása sikertelen.",
        },
      },
      { status: 500 }
    );
  }
}
