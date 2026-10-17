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

type MessageLanguage = "hu" | "en" | "other";

interface SimulatedUserResult {
  message: string;
  shouldStop: boolean;
  reason: string;
  language?: MessageLanguage;
  goalStep?: number;
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

function inferRequiredLanguage(
  persona: string,
  goal: string,
  hiddenConstraints: string,
  turnNumber: number
): MessageLanguage | null {
  const combinedText = `${persona}
${goal}
${hiddenConstraints}`
    .toLowerCase();
  const turnWords =
    turnNumber === 2
      ? ["második", "2.", "second"]
      : turnNumber === 3
        ? ["harmadik", "3.", "third"]
        : ["első", "1.", "first"];
  const relevantLines = combinedText
    .split(/\n+/)
    .filter((line) =>
      turnWords.some((turnWord) => line.includes(turnWord))
    )
    .join(" ");

  if (/angol|english/.test(relevantLines)) {
    return "en";
  }

  if (/magyar|hungarian/.test(relevantLines)) {
    return "hu";
  }

  return null;
}

function isMessageLanguageValid(
  message: string,
  requiredLanguage: MessageLanguage | null
): boolean {
  if (!requiredLanguage || requiredLanguage === "other") {
    return true;
  }

  const normalized = message.toLowerCase();
  const hungarianMarkers = [
    /[áéíóöőúüű]/,
    /\b(köszönöm|kérem|milyen|mennyi|mi|az|egy|és|vagy|hogy|most|szeretném|térnék|vonatkozik|megengedett)\b/,
  ];
  const englishMarkers = [
    /\b(what|which|how|the|and|is|are|does|please|could|maximum|required|pressure|requirements)\b/,
  ];
  const hasHungarian = hungarianMarkers.some((pattern) =>
    pattern.test(normalized)
  );
  const hasEnglish = englishMarkers.some((pattern) =>
    pattern.test(normalized)
  );

  if (requiredLanguage === "en") {
    return hasEnglish && !hasHungarian;
  }

  return hasHungarian && !hasEnglish;
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

    const requiredLanguage = inferRequiredLanguage(
      persona,
      goal,
      hiddenConstraints,
      turnNumber
    );

    const prompt = `
Egy szimulált felhasználót játszol egy SMT műszaki asszisztens tesztelésében.

PERSONA:
${persona}

A FELHASZNÁLÓ CÉLJA:
${goal}

REJTETT FELTÉTELEK:
${hiddenConstraints}

AKTUÁLIS FORDULÓ:
${turnNumber} / ${maximumTurns}

PROGRAMOZOTTAN ELVÁRT NYELV:
${requiredLanguage ?? "nincs külön előírva"}

EDDIGI BESZÉLGETÉS:
${conversationText}

Feladatod:
Írd meg a szimulált felhasználó következő üzenetét.

Szabályok:
- Mindig az SMT műszaki asszisztens legutóbbi válaszára reagálj.
- Ne ismételd szó szerint a beszélgetés korábbi mondatait.
- Ne segíts az asszisztensnek azzal, hogy összefoglalod helyette a teljes beszélgetést.
- Ne írd azt, hogy vegye figyelembe az összes korábbi feltételt.
- A rejtett feltételeket természetes beszélgetésben, fokozatosan közöld.
- Egyszerre legfeljebb egy új fontos műszaki feltételt adj meg.
- Ha az asszisztens pontosító kérdést tett fel, válaszolj közvetlenül arra.
- Tartsd meg a personában szereplő gépet, gyártót, típust, hibakódot és hibajelenséget.
- Ha az asszisztens összekeveri a géptípust, hibakódot vagy dokumentumot, jelezd természetesen a problémát.
- Ha az asszisztens nem dokumentált paramétert, eljárást vagy javítási lépést ad, kérdezz rá annak forrására.
- Ha az asszisztens egyértelműen közli, hogy a visszakeresett műszaki forrásokban nincs elegendő információ, és nem talál ki nem igazolt megoldást, tekintsd ezt helyes és biztonságos végállapotnak: a shouldStop legyen true.
- A helyes forráshiány-jelzés után ne ismételd meg ugyanazt a kérést, és ne kényszerítsd az asszisztenst forrás nélküli műszaki útmutatásra.
- Csak akkor állítsd le forráshiány miatt a beszélgetést, ha az asszisztens a jelenlegi vagy visszakeresett forrásokra korlátozza az állítását.
- Ha a válasz megfelelően teljesíti a célt, megőrzi a beszélgetési kontextust és minden feltételt, a shouldStop értéke legyen true.
- Ha elértük a maximális fordulószámot, a shouldStop értéke legyen true.
- A message legyen rövid és természetes.
- A message nyelve pontosan kövesse az aktuális fordulóra előírt nyelvet.
- Ne használj vegyes nyelvű felvezetést vagy köszönetet.
- A language mező a message tényleges nyelve legyen.
- A goalStep az aktuálisan végrehajtott cél-lépés sorszáma legyen.
- Ne magyarázd el az értékelési folyamatot.
- Kizárólag érvényes JSON-választ adj.

A válasz formája:
{
  "message": "A következő felhasználói üzenet.",
  "shouldStop": false,
  "reason": "Rövid indoklás arról, hogy miért folytatódik vagy áll le a szimuláció.",
  "language": "hu vagy en vagy other",
  "goalStep": 2
}
`

    async function generateSimulatedMessage(
      correction?: string
    ): Promise<SimulatedUserResult> {
      const completion =
        await client.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                "Szigorúan követed a megadott personát, cél-lépést és nyelvi előírást. " +
                "A message nem lehet kevert nyelvű. " +
                "Kizárólag érvényes JSON formátumban válaszolsz.",
            },
            {
              role: "user",
              content: correction
                ? `${prompt}

JAVÍTÁSI UTASÍTÁS:
${correction}`
                : prompt,
            },
          ],
          response_format: {
            type: "json_object",
          },
          temperature: correction ? 0 : 0.2,
        });

      const content =
        completion.choices[0]?.message.content;

      if (!content) {
        throw new Error(
          "A szimulált felhasználó nem adott választ."
        );
      }

      return JSON.parse(content) as SimulatedUserResult;
    }

    let parsed = await generateSimulatedMessage();
    let message = String(parsed.message ?? "").trim();
    let languageWasRegenerated = false;

    if (!isMessageLanguageValid(message, requiredLanguage)) {
      languageWasRegenerated = true;
      parsed = await generateSimulatedMessage(
        `Az előző message nem felelt meg a kötelező ${requiredLanguage} nyelvnek, vagy kevert nyelvű volt. ` +
          `Generáld újra kizárólag ${requiredLanguage} nyelven, bevezető és más nyelvű rész nélkül.`
      );
      message = String(parsed.message ?? "").trim();
    }

    if (!isMessageLanguageValid(message, requiredLanguage)) {
      throw new Error(
        "A szimulált felhasználói üzenet az újragenerálás után sem felel meg az előírt nyelvnek."
      );
    }

    const reason = String(parsed.reason ?? "").trim();
    const language: MessageLanguage =
      requiredLanguage ??
      (parsed.language === "en" ||
      parsed.language === "other"
        ? parsed.language
        : "hu");
    const goalStep = Number.isInteger(Number(parsed.goalStep))
      ? Math.max(1, Number(parsed.goalStep))
      : turnNumber;

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
        language,
        goalStep,
        languageValidated: true,
        languageWasRegenerated,
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