import OpenAI from "openai";
import { NextResponse } from "next/server";

import type {
  ChatMessageInput,
} from "@/lib/chat-types";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-4o-mini";

interface SimulateUserRequest {
  persona?: unknown;
  goal?: unknown;
  hiddenConstraints?: unknown;
  conversation?: unknown;
  turnNumber?: unknown;
  maximumTurns?: unknown;
}

interface SimulatedUserResult {
  message: string;
  shouldStop: boolean;
  reason: string;
}

function createOpenAIClient(): OpenAI {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Az OPENAI_API_KEY környezeti változó nincs beállítva."
    );
  }

  return new OpenAI({
    apiKey,
  });
}

function parseConversation(
  value: unknown
): ChatMessageInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const messages: ChatMessageInput[] = [];

  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null
    ) {
      return null;
    }

    const role = Reflect.get(item, "role");
    const content = Reflect.get(
      item,
      "content"
    );

    if (
      role !== "user" &&
      role !== "assistant"
    ) {
      return null;
    }

    if (typeof content !== "string") {
      return null;
    }

    const normalizedContent =
      content.trim();

    if (
      normalizedContent.length === 0 ||
      normalizedContent.length > 2000
    ) {
      return null;
    }

    messages.push({
      role,
      content: normalizedContent,
    });
  }

  return messages;
}

function createConversationText(
  conversation: ChatMessageInput[]
): string {
  if (conversation.length === 0) {
    return "A beszélgetés még nem kezdődött el.";
  }

  return conversation
    .map((message, index) => {
      const speaker =
        message.role === "user"
          ? "Felhasználó"
          : "Asszisztens";

      return (
        `${index + 1}. ${speaker}: ` +
        message.content
      );
    })
    .join("\n\n");
}

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as SimulateUserRequest;

    const persona = String(
      body.persona ?? ""
    ).trim();

    const goal = String(
      body.goal ?? ""
    ).trim();

    const hiddenConstraints = String(
      body.hiddenConstraints ?? ""
    ).trim();

    const turnNumber = Number(
      body.turnNumber
    );

    const maximumTurns = Number(
      body.maximumTurns ?? 3
    );

    const conversation = parseConversation(
      body.conversation
    );

    if (!persona) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A szimulált felhasználó personája kötelező.",
        },
        {
          status: 400,
        }
      );
    }

    if (!goal) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A szimulált felhasználó célja kötelező.",
        },
        {
          status: 400,
        }
      );
    }

    if (!hiddenConstraints) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A rejtett felhasználói feltételek megadása kötelező.",
        },
        {
          status: 400,
        }
      );
    }

    if (!conversation) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A conversation mező érvényes üzenetlistát tartalmazzon.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(turnNumber) ||
      turnNumber < 1
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A turnNumber pozitív egész szám legyen.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(maximumTurns) ||
      maximumTurns < 1 ||
      maximumTurns > 5
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A maximumTurns értéke 1 és 5 közötti egész szám legyen.",
        },
        {
          status: 400,
        }
      );
    }

    const conversationText =
      createConversationText(
        conversation
      );

    const client = createOpenAIClient();

    const model =
      process.env.OPENAI_CHAT_MODEL?.trim() ||
      DEFAULT_MODEL;

    const prompt = `
Egy szimulált felhasználót játszol egy AI receptasszisztens tesztelésében.

PERSONA:
${persona}

A FELHASZNÁLÓ CÉLJA:
${goal}

REJTETT FELTÉTELEK:
${hiddenConstraints}

AKTUÁLIS FORDULÓ:
${turnNumber} / ${maximumTurns}

EDDIGI BESZÉLGETÉS:
${conversationText}

Feladatod:
Írd meg a szimulált felhasználó következő üzenetét.

Szabályok:
- Mindig a receptasszisztens legutóbbi válaszára reagálj.
- Ne ismételd szó szerint a beszélgetés korábbi mondatait.
- Ne segíts az asszisztensnek azzal, hogy összefoglalod helyette a teljes beszélgetést.
- Ne írd azt, hogy vegye figyelembe az összes korábbi feltételt.
- A rejtett feltételeket természetes beszélgetésben, fokozatosan közöld.
- Egyszerre legfeljebb egy új fontos feltételt adj meg.
- Ha az asszisztens pontosító kérdést tett fel, válaszolj közvetlenül arra.
- Ha az asszisztens olyan receptet ajánlott, amely megsérti valamelyik rejtett feltételt, jelezd természetesen a problémát.
- Ha az asszisztens egyértelműen közli, hogy a most visszakeresett receptforrások között nem talált minden rejtett feltételnek megfelelő receptet, és nem talál ki nem igazolt alternatívát, tekintsd ezt helyes és biztonságos végállapotnak: a shouldStop legyen true.
- A helyes forráshiány-jelzés után ne ismételd meg ugyanazt a receptkérést, és ne kényszerítsd az asszisztenst forrás nélküli ajánlásra.
- Csak akkor állítsd le forráshiány miatt a beszélgetést, ha az asszisztens a jelenlegi vagy visszakeresett forrásokra korlátozza az állítását. Ha megalapozatlanul a teljes adatbázisról állítja, hogy nincs megfelelő recept, ezt természetesen pontosítsd, és ne állítsd le automatikusan a beszélgetést.
- Ha a válasz megfelelően teljesíti a célt és minden feltételt, a shouldStop értéke legyen true.
- Ha elértük a maximális fordulószámot, a shouldStop értéke legyen true.
- A message rövid, természetes, magyar nyelvű felhasználói üzenet legyen.
- Ne magyarázd el az értékelési folyamatot.
- Kizárólag érvényes JSON-választ adj.

A válasz formája:

{
  "message": "A következő felhasználói üzenet.",
  "shouldStop": false,
  "reason": "Rövid indoklás arról, hogy miért folytatódik vagy áll le a szimuláció."
}
`;

    const completion =
      await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "Szigorúan követed a megadott felhasználói personát. " +
              "Kizárólag érvényes JSON formátumban válaszolsz.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: {
          type: "json_object",
        },
        temperature: 0.3,
      });

    const content =
      completion.choices[0]?.message.content;

    if (!content) {
      throw new Error(
        "A szimulált felhasználó nem adott választ."
      );
    }

    const parsed =
      JSON.parse(
        content
      ) as SimulatedUserResult;

    const message = String(
      parsed.message ?? ""
    ).trim();

    const reason = String(
      parsed.reason ?? ""
    ).trim();

    const reachedMaximumTurns =
      turnNumber >= maximumTurns;

    const shouldStop =
      reachedMaximumTurns ||
      parsed.shouldStop === true;

    if (!message) {
      throw new Error(
        "A szimulált felhasználói üzenet üres."
      );
    }

    return NextResponse.json({
      success: true,
      model,
      result: {
        message: message.slice(0, 1000),
        shouldStop,
        reason:
          reason ||
          "Nem érkezett külön indoklás.",
      },
    });
  } catch (error) {
    console.error(
      "User simulator hiba:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "A szimulált felhasználó futtatása sikertelen.",
      },
      {
        status: 500,
      }
    );
  }
}