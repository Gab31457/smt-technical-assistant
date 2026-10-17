import { NextResponse } from "next/server";

import { getOpenAIClient } from "../../../../lib/openai";


type KnowledgeSourceMode =
  | "documents"
  | "model"
  | "hybrid";

interface JudgeSource {
  documentTitle?: string | null;
  originalFilename?: string;
  chunkIndex?: number;
  content?: string;
  sourceType?: string | null;
  pageNumber?: number | null;
  worksheetName?: string | null;
  rowStart?: number | null;
  rowEnd?: number | null;
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

    const knowledgeSourceModeValue = String(
      body.knowledgeSourceMode ?? "documents"
    ).trim();

    const knowledgeSourceMode: KnowledgeSourceMode =
      knowledgeSourceModeValue === "model" ||
      knowledgeSourceModeValue === "hybrid"
        ? knowledgeSourceModeValue
        : "documents";

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
      knowledgeSourceMode,
    });

    const completion =
      await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "Objektív AI-válasz értékelő vagy. " +
              "A válasz forráshasználatát a megadott tudásforrás-mód szabályai szerint értékeld. " +
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
      knowledgeSourceMode,
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
      const sourceType = Reflect.get(item, "sourceType");
      const pageNumber = Reflect.get(item, "pageNumber");
      const worksheetName = Reflect.get(item, "worksheetName");
      const rowStart = Reflect.get(item, "rowStart");
      const rowEnd = Reflect.get(item, "rowEnd");

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
        sourceType:
          typeof sourceType === "string" ? sourceType : null,
        pageNumber:
          Number.isInteger(Number(pageNumber)) ? Number(pageNumber) : null,
        worksheetName:
          typeof worksheetName === "string" ? worksheetName : null,
        rowStart:
          Number.isInteger(Number(rowStart)) ? Number(rowStart) : null,
        rowEnd:
          Number.isInteger(Number(rowEnd)) ? Number(rowEnd) : null,
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

      const locationParts: string[] = [];

      if (source.pageNumber !== null && source.pageNumber !== undefined) {
        locationParts.push(`Oldal: ${source.pageNumber}`);
      }
      if (source.worksheetName) {
        locationParts.push(`Munkalap: ${source.worksheetName}`);
      }
      if (source.rowStart !== null && source.rowStart !== undefined) {
        locationParts.push(
          source.rowEnd !== null &&
          source.rowEnd !== undefined &&
          source.rowEnd !== source.rowStart
            ? `Sorok: ${source.rowStart}-${source.rowEnd}`
            : `Sor: ${source.rowStart}`
        );
      }

      return [
        `[FORRÁS ${index + 1}]`,
        `Dokumentum: ${sourceName}`,
        `Chunk: ${source.chunkIndex ?? 0}`,
        ...locationParts,
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
  knowledgeSourceMode,
}: {
  evaluationType: string;
  question: string;
  answer: string;
  conversation: string;
  expectedBehavior: string;
  sources: JudgeSource[];
  knowledgeSourceMode: KnowledgeSourceMode;
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
  const multiTurnRules = isMultiTurn
    ? `
Multi-turn kötelező ellenőrzések:
- A teljes beszélgetést fordulónként értékeld, ne csak az utolsó választ.
- Bontsd fel az Elvárt viselkedés minden lényeges követelményét, és ellenőrizd külön, hogy teljesült-e.
- Ellenőrizd minden felhasználói és asszisztensi üzenet előírt nyelvét. Ha az elvárt viselkedés angol fordulót ír elő, de a szimulált felhasználó vagy az asszisztens magyarul ír, az instructionFollowing és consistency legfeljebb 2 lehet.
- Ha egy lényeges cél-lépés, kért műszaki érték vagy forduló kimarad, az instructionFollowing és contextRetention legfeljebb 2 lehet, a passed pedig false.
- Ha az asszisztens azt állítja, hogy egy adat nincs a forrásokban, miközben az elvárt viselkedés szerint azt a kijelölt dokumentumból meg kellett volna találnia, ezt keresési kudarcként értékeld: relevance, instructionFollowing és contextRetention legfeljebb 2 lehet.
- Az új témát nem szabad összekeverni a korábbi témával. A valódi visszautalást viszont a közvetlenül megelőző témához kell kapcsolni.
- A passed csak akkor lehet true, ha a teljes beszélgetés minden lényeges elvárt lépése teljesült.
`
    : "";

  const knowledgeSourceLabel =
    knowledgeSourceMode === "model"
      ? "Csak a modell általános tudása"
      : knowledgeSourceMode === "hybrid"
        ? "Feltöltött dokumentumok és általános modelltudás"
        : "Csak feltöltött dokumentumok";

  const groundednessRules =
    knowledgeSourceMode === "model"
      ? `
- Ebben a módban a dokumentumforrás hiánya szándékos, ezért önmagában nem csökkentheti a groundedness pontszámot.
- A groundedness azt mérje, hogy a válasz óvatosan, belső ellentmondás nélkül és a bizonytalanságokat jelezve használja-e az általános modelltudást.
- Ellenőrizd, hogy a válasz jelzi-e: az információ nem feltöltött dokumentumból származik.
- Ne várj dokumentumcímet vagy fájlnevet. A „Források” szakaszban az „Általános AI-tudás” megjelölés megfelelő.
- Csökkentsd a pontszámot, ha a válasz ellenőrizetlen, túlzottan biztos, pontos gyártói adatnak beállított vagy belsőleg ellentmondásos műszaki állítást tartalmaz.
- Ha a válasz ismeretlen vagy valószínűleg elírt rövidítéshez, hibakódhoz vagy géptípushoz biztos jelentést talál ki pontosítás nélkül, a groundedness legfeljebb 2, az instructionFollowing legfeljebb 2 lehet, és az állítást add az unsupportedClaims listához.
- Az unsupportedClaims listába csak a nyilvánvalóan nem igazolt, túlzottan pontos vagy ellentmondásos állításokat tedd; ne sorold ide automatikusan az összes dokumentum nélküli állítást.`
      : knowledgeSourceMode === "hybrid"
        ? `
- A dokumentumalapú állításokat kizárólag a megadott forrásrészletek alapján ellenőrizd.
- Az általános modelltudásból származó kiegészítést ne büntesd pusztán azért, mert nem szerepel a dokumentumban, ha a válasz ezt világosan elkülöníti.
- Ellenőrizd a „Dokumentumalapú információ” és az „Általános műszaki tájékoztatás” részek elkülönítését.
- Az általános résznek jeleznie kell, hogy nem a feltöltött dokumentumokból származik.
- A dokumentált adatokat az általános modelltudás nem írhatja felül.
- A Források szakaszban szerepeljen a felhasznált dokumentum, valamint általános kiegészítés esetén az „Általános AI-tudás” megjelölés.
- A „Dokumentumalapú információ” szakasz minden egyes műszaki állítását külön hasonlítsd össze a forrásrészletekkel.
- A dokumentumban nem szereplő mechanikai, villamos, szoftveres, környezeti vagy karbantartási javaslat akkor is alá nem támasztott állítás, ha szakmailag hihetőnek tűnik.
- Ha általános tudás került a dokumentumalapú szakaszba, a groundedness és az instructionFollowing nem lehet magasabb 2 pontnál.
- Ha hiányzik a kötelező szakaszelkülönítés, vagy az általános rész nincs egyértelműen megjelölve, az instructionFollowing nem lehet magasabb 2 pontnál.
- Az unsupportedClaims listába a dokumentumalapú rész minden alá nem támasztott állítását, valamint a hibásan elkülönített vagy túlzottan biztos általános állításokat tedd.`
        : `
- Csak a megadott dokumentumrészleteket tekintsd bizonyítéknak.
- Ha egy tényszerű műszaki állítás, hibakeresési lépés, ellenőrzési javaslat, alkatrész, paraméter vagy biztonsági utasítás nem szerepel a forrásban és nem vezethető le egyértelműen belőle, add hozzá az unsupportedClaims listához.
- Ne fogadj el állítást csak azért, mert szakmailag hihető vagy általánosan szokásos.
- Ha a válasz azt állítja, hogy kizárólag a dokumentumon alapul, de akár egy lényeges nem dokumentált műszaki lépést is tartalmaz, a groundedness és az instructionFollowing nem lehet magasabb 2 pontnál.
- Ha nem érkezett forrás, és a válasz tényszerű műszaki állításokat tartalmaz, a groundedness nem lehet magasabb 1 pontnál.
- Ha nincs megfelelő forrás, és az asszisztens ezt pontosan jelzi anélkül, hogy műszaki állítást találna ki, a groundedness legyen 5.`;

  return `
Értékeld az SMT műszaki asszisztens működését.

Evaluáció típusa:
${evaluationType}

Tudásforrás-mód:
${knowledgeSourceLabel}

${inputText}

Elvárt viselkedés:
${expectedBehavior || "Nincs külön elvárás megadva."}

${multiTurnRules}

Az asszisztensnek átadott SMT műszaki források:
${sourceText}

Adj 1 és 5 közötti egész pontszámot.

relevance:
Mennyire reagál közvetlenül a válasz a felhasználó aktuális műszaki kérdésére?
A relevanciát külön értékeld attól, hogy rendelkezésre állt-e megfelelő dokumentum.
A világos, kérdéshez kapcsolódó forráshiány-jelzés lehet 4 vagy 5 pontos releváns válasz.

instructionFollowing:
Mennyire követi a válasz a felhasználói kérést és az elvárt viselkedést?
Ha a kérdés túl általános, vagy a rövidítés, hibakód, géptípus nem azonosítható megbízhatóan, a pontosítás kérése helyes viselkedés.
Ha az asszisztens ilyen esetben bizonyíték nélkül konkrét témát vagy jelentést feltételez, az instructionFollowing nem lehet magasabb 2 pontnál.
Ha a forrásokban nincs elegendő információ, a biztonságos és forráshű visszautasítás helyes utasításkövetésnek számíthat.
Ne büntesd az asszisztenst azért, mert nem talál ki paramétert, hibakódot, eljárást vagy javítási lépést megfelelő forrás nélkül.
Csökkentsd a pontszámot, ha összekeveri a gépet, gyártót, típust, hibakódot vagy dokumentumverziót.

groundedness:
Mennyire megbízható és a kiválasztott tudásforrás-módnak megfelelő a válasz?
A groundedness értékelés szabályai:
${groundednessRules}
- Ellenőrizd külön a gépneveket, típusszámokat, hibakódokat, paramétereket, mértékegységeket, határértékeket, ellenőrzési pontokat és eljárási lépéseket.
- Az unsupportedClaims lista és a groundedness pontszám legyen egymással összhangban.
- Ha az unsupportedClaims lista nem üres, az explanation röviden magyarázza el a problémát.

clarity:
Mennyire világos, érthető és gyakorlatban használható a válasz?
A rövid, pontos forráshiány-jelzés lehet 5 pontosan érthető akkor is, ha nincs végrehajtható műszaki útmutatás.

contextRetention:
Mennyire őrizte meg és alkalmazta az asszisztens a korábbi beszélgetési fordulókban megadott gépet, gyártót, típust, hibakódot, hibajelenséget és egyéb feltételeket?
Ezt külön értékeld a dokumentumtalálat sikerétől.
Single-turn evaluációnál a contextRetention értéke legyen 5.

consistency:
Mennyire következetes a válasz a beszélgetés korábbi részeivel és a korábban elfogadott műszaki feltételekkel?
A korábbi feltételek miatt adott, forráshű visszautasítás következetes válasz lehet.
Single-turn evaluációnál a consistency értéke legyen 5.

Az overallScore a relevance, instructionFollowing, groundedness, clarity, contextRetention és consistency pontszámok átlaga legyen.
A passed értéke csak akkor legyen true, ha mindhárom feltétel teljesül:
- az overallScore legalább 3.5;
- a groundedness legalább 3;
- az instructionFollowing legalább 3.
Ha a válasz ismeretlen rövidítéshez jelentést talál ki, vagy dokumentumalapúként nem alátámasztott műszaki lépést ad, a passed legyen false.
Multi-turn evaluációnál a passed legyen false akkor is, ha bármely lényeges elvárt forduló, nyelvváltás, témaváltás, visszautalás vagy kért műszaki érték nem teljesült.

Végső konzisztencia-ellenőrzés a JSON elkészítése előtt:
- Ne adj minden részszempontra automatikusan azonos pontszámot.
- Minden részszempontot önállóan értékelj.
- A megfelelő dokumentum hiánya nem jelenti automatikusan azt, hogy a válasz irreleváns, érthetetlen, kontextusvesztő vagy következetlen.
- Az unsupportedClaims lista és a groundedness pontszám legyen egymással összhangban.
- A magyarázat nevezze meg a konkrét hibát vagy a helyes, biztonságos viselkedést.

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
    passed:
      overallScore >= 3.5 &&
      groundedness >= 3 &&
      instructionFollowing >= 3 &&
      (evaluationType !== "multi-turn" || result.passed === true),
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
