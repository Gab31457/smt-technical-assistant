import { NextResponse } from "next/server";

import { getOpenAIClient } from "../../../../lib/openai";

interface JudgeSource {
  documentTitle?: string | null;
  originalFilename?: string;
  chunkIndex?: number;
  content?: string;
}

interface JudgeResult {
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  contextRetention: number;
  consistency: number;
  overallScore: number;
  passed: boolean;
  unsupportedClaims: string[];
  explanation: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const question = String(
      body.question ?? ""
    ).trim();

    const answer = String(
      body.answer ?? ""
    ).trim();

    const conversation = String(
      body.conversation ?? ""
    ).trim();

    const expectedBehavior = String(
      body.expectedBehavior ?? ""
    ).trim();

    const evaluationType = String(
      body.evaluationType ?? "single-turn"
    ).trim();

    const sources = parseSources(body.sources);

    if (!answer) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Az értékelendő válasz megadása kötelező.",
        },
        { status: 400 }
      );
    }

    if (!question && !conversation) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A kérdés vagy a beszélgetés megadása kötelező.",
        },
        { status: 400 }
      );
    }

    const client = getOpenAIClient();

    const model =
      process.env.OPENAI_CHAT_MODEL?.trim() ||
      "gpt-4o-mini";

    const judgePrompt = createJudgePrompt({
      evaluationType,
      question,
      answer,
      conversation,
      expectedBehavior,
      sources,
    });

    const completion =
      await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "Objektív AI-válasz értékelő vagy. " +
              "A groundedness értékelésénél kizárólag a megadott forrásokra támaszkodj. " +
              "Kizárólag érvényes JSON formátumban válaszolj.",
          },
          {
            role: "user",
            content: judgePrompt,
          },
        ],
        response_format: {
          type: "json_object",
        },
        temperature: 0,
      });

    const content =
      completion.choices[0]?.message.content;

    if (!content) {
      throw new Error(
        "Az LLM Judge nem adott vissza értékelést."
      );
    }

    const parsedResult =
      JSON.parse(content) as JudgeResult;

    const result = normalizeJudgeResult(
      parsedResult,
      evaluationType
    );

    return NextResponse.json({
      success: true,
      model,
      evaluationType,
      sourceCount: sources.length,
      result,
    });
  } catch (error) {
    console.error("LLM Judge hiba:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Ismeretlen értékelési hiba történt.",
      },
      { status: 500 }
    );
  }
}

function parseSources(value: unknown): JudgeSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item) =>
        typeof item === "object" &&
        item !== null
    )
    .map((item) => {
      const documentTitle = Reflect.get(
        item,
        "documentTitle"
      );
      const originalFilename = Reflect.get(
        item,
        "originalFilename"
      );
      const chunkIndex = Reflect.get(
        item,
        "chunkIndex"
      );
      const content = Reflect.get(item, "content");

      return {
        documentTitle:
          typeof documentTitle === "string"
            ? documentTitle
            : null,
        originalFilename:
          typeof originalFilename === "string"
            ? originalFilename
            : "Ismeretlen fájl",
        chunkIndex:
          Number.isInteger(Number(chunkIndex))
            ? Number(chunkIndex)
            : 0,
        content:
          typeof content === "string"
            ? content.trim().slice(0, 6000)
            : "",
      };
    })
    .filter((source) => source.content);
}

function createSourceText(
  sources: JudgeSource[]
): string {
  if (sources.length === 0) {
    return "Nem érkezett ellenőrizhető forrásrészlet.";
  }

  return sources
    .map((source, index) => {
      const sourceName =
        source.documentTitle ||
        source.originalFilename ||
        "Ismeretlen forrás";

      return [
        `[FORRÁS ${index + 1}]`,
        `Dokumentum: ${sourceName}`,
        `Chunk: ${source.chunkIndex ?? 0}`,
        "Tartalom:",
        source.content || "",
      ].join("\n");
    })
    .join("\n\n");
}

function createJudgePrompt({
  evaluationType,
  question,
  answer,
  conversation,
  expectedBehavior,
  sources,
}: {
  evaluationType: string;
  question: string;
  answer: string;
  conversation: string;
  expectedBehavior: string;
  sources: JudgeSource[];
}) {
  const isMultiTurn =
    evaluationType === "multi-turn";

  const inputText = isMultiTurn
    ? `
Teljes beszélgetés:
${conversation}

Utolsó asszisztensválasz:
${answer}
`
    : `
Felhasználói kérdés:
${question}

Asszisztensválasz:
${answer}
`;

  const sourceText = createSourceText(sources);

  return `
Értékeld az AI receptasszisztens működését.

Evaluáció típusa:
${evaluationType}

${inputText}

Elvárt viselkedés:
${expectedBehavior || "Nincs külön elvárás megadva."}

Az asszisztensnek átadott receptforrások:
${sourceText}

Adj 1 és 5 közötti egész pontszámot.

relevance:
Mennyire reagál közvetlenül a válasz a felhasználó aktuális kérésére?
A relevanciát külön értékeld attól, hogy sikerült-e megfelelő receptet találni.
A világos, a kéréshez kapcsolódó forráshiány-jelzés lehet 4 vagy 5 pontos releváns válasz.

instructionFollowing:
Mennyire követi a válasz a felhasználói kérést és az elvárt viselkedést?
Ha a források között nincs egyértelműen minden feltételnek megfelelő recept, akkor a biztonságos és forráshű visszautasítás helyes utasításkövetésnek számíthat.
Ne büntesd azért az asszisztenst, mert nem talál ki receptet vagy helyettesítést megfelelő forrás nélkül.
Csak akkor csökkentsd erősen a pontszámot, ha nem megfelelő receptet ajánl, figyelmen kívül hagy fontos feltételt, vagy forrás nélküli állítást tesz.

groundedness:
Mennyire támasztható alá a válasz minden tényszerű állítása a megadott receptforrásokból?

A groundedness értékelés szabályai:
- Csak a megadott forrásrészleteket tekintsd bizonyítéknak.
- Ne fogadj el egy állítást pusztán azért, mert hihetőnek tűnik.
- Ellenőrizd külön a hozzávalókat, mennyiségeket, elkészítési időt, adagszámot, étrendi tulajdonságokat és helyettesítési javaslatokat.
- Ha egy tényszerű állítás nem szerepel a forrásban és nem vezethető le egyértelműen belőle, add hozzá az unsupportedClaims listához.
- Különböztesd meg ezt a két állítást:
  1. „A most visszakeresett források között nem találtam megfelelő receptet.” Ez óvatos, ellenőrizhető állítás lehet.
  2. „A teljes adatbázisban nincs megfelelő recept.” Ez túl általános állítás, ha csak néhány forrásrészlet áll rendelkezésre.
- Ha az asszisztens nem talál megfelelő forrást, ezt pontosan jelzi, és nem tesz nem igazolt receptállítást, a groundedness legyen 5.
- Ha nem érkezett forrás, és a válasz tényszerű receptállításokat tartalmaz, a groundedness nem lehet magasabb 1 pontnál.
- Ha az unsupportedClaims lista üres, a groundedness csak külön, világosan megindokolt súlyos probléma esetén lehet 1 vagy 2. Az indoklásban nevezd meg ezt a problémát.
- Ha az unsupportedClaims lista nem üres, az explanation röviden magyarázza el, hogy az állítások miért nem támaszthatók alá.

clarity:
Mennyire világos és érthető a válasz?
A rövid, pontos forráshiány-jelzés lehet 5 pontosan érthető akkor is, ha nincs receptajánlás.

contextRetention:
Mennyire őrizte meg és alkalmazta az asszisztens a korábbi beszélgetési fordulókban megadott feltételeket?
Ezt külön értékeld a recepttalálat sikerétől.
Ha az asszisztens a végső válaszban egyszerre figyelembe veszi az összes korábbi feltételt, magas pontszámot adj akkor is, ha megfelelő forrás hiányában nem ajánl receptet.
Single-turn evaluációnál a contextRetention értéke legyen 5.

consistency:
Mennyire következetes a válasz a beszélgetés korábbi részeivel és a korábban elfogadott feltételekkel?
Ezt külön értékeld attól, hogy talált-e megfelelő receptet.
A korábbi feltételek miatt adott, forráshű visszautasítás következetes válasz lehet.
Single-turn evaluációnál a consistency értéke legyen 5.

Az overallScore a relevance, instructionFollowing, groundedness, clarity, contextRetention és consistency pontszámok átlaga legyen.

A passed értéke akkor legyen true, ha az overallScore legalább 3.5.

Végső konzisztencia-ellenőrzés a JSON elkészítése előtt:
- Ne adj minden részszempontra automatikusan azonos pontszámot.
- Minden részszempontot önállóan értékelj.
- A feladat eredménytelensége nem jelenti automatikusan azt, hogy a válasz irreleváns, érthetetlen, kontextusvesztő vagy következetlen.
- Az unsupportedClaims lista és a groundedness pontszám legyen egymással összhangban.
- A magyarázat nevezze meg a konkrét hibát vagy a helyes biztonsági viselkedést.

Kizárólag érvényes JSON-választ adj ebben a formában:

{
  "relevance": 1,
  "instructionFollowing": 1,
  "groundedness": 1,
  "clarity": 1,
  "contextRetention": 1,
  "consistency": 1,
  "overallScore": 1,
  "passed": false,
  "unsupportedClaims": [],
  "explanation": "Rövid magyar nyelvű indoklás, amely külön kitér a forrásalapúságra."
}
`;
}

function normalizeJudgeResult(
  result: JudgeResult,
  evaluationType: string
): JudgeResult {
  const relevance = normalizeScore(
    result.relevance
  );

  const instructionFollowing = normalizeScore(
    result.instructionFollowing
  );

  const groundedness = normalizeScore(
    result.groundedness
  );

  const clarity = normalizeScore(
    result.clarity
  );

  const contextRetention =
    evaluationType === "multi-turn"
      ? normalizeScore(result.contextRetention)
      : 5;

  const consistency =
    evaluationType === "multi-turn"
      ? normalizeScore(result.consistency)
      : 5;

  const overallScore = Number(
    (
      (
        relevance +
        instructionFollowing +
        groundedness +
        clarity +
        contextRetention +
        consistency
      ) / 6
    ).toFixed(2)
  );

  const unsupportedClaims = Array.isArray(
    result.unsupportedClaims
  )
    ? result.unsupportedClaims
        .map((claim) => String(claim).trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    relevance,
    instructionFollowing,
    groundedness,
    clarity,
    contextRetention,
    consistency,
    overallScore,
    passed: overallScore >= 3.5,
    unsupportedClaims,
    explanation:
      String(result.explanation ?? "").trim() ||
      "Nem érkezett részletes indoklás.",
  };
}

function normalizeScore(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 1;
  }

  return Math.min(
    5,
    Math.max(1, Math.round(numericValue))
  );
}
