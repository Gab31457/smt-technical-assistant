/*
 * A chunking modul feladata a hosszabb dokumentumszövegek
 * kisebb, részben átfedő szövegrészekre bontása.
 *
 * A modul nem használ OpenAI API-t és nem kapcsolódik
 * az adatbázishoz. Ez egy önálló, tisztán helyi
 * szövegfeldolgozó komponens.
 */


/*
 * A chunking konfigurációja.
 *
 * A maxChunkCharacters meghatározza egy chunk ajánlott
 * maximális karakterszámát.
 *
 * Az overlapCharacters meghatározza, hogy két egymást
 * követő chunk között körülbelül hány karakteres
 * átfedést szeretnénk.
 *
 * A minChunkCharacters segítségével elkerülhetjük
 * a nagyon rövid, önmagukban kevés információt
 * tartalmazó chunkokat.
 */
export interface ChunkingOptions {
  maxChunkCharacters: number;
  overlapCharacters: number;
  minChunkCharacters: number;
}


/*
 * Egy létrehozott chunk adatszerkezete.
 *
 * Ezt az adatszerkezetet később közvetlenül
 * felhasználhatjuk a document_chunks tábla feltöltéséhez.
 */
export interface TextChunk {
  /*
   * A chunk sorszáma.
   *
   * Az első chunk indexe 0.
   */
  chunkIndex: number;

  /*
   * A chunk tényleges szövege.
   */
  content: string;

  /*
   * A chunk karakterszáma.
   */
  characterCount: number;

  /*
   * A becsült tokenszám.
   *
   * Ez nem pontos tokenizereredmény, csak egy közelítő
   * becslés. Általános szövegnél körülbelül négy
   * karaktert számolunk egy tokennek.
   */
  estimatedTokenCount: number;

  /*
   * A chunk kezdőpozíciója a normalizált dokumentumban.
   */
  startPosition: number;

  /*
   * A chunk végpozíciója a normalizált dokumentumban.
   */
  endPosition: number;
}


/*
 * Alapértelmezett chunking beállítások.
 *
 * Ezek a beállítások receptszövegekhez megfelelő
 * kiindulópontot adnak:
 *
 * - maximum 1200 karakter chunkonként;
 * - körülbelül 200 karakter átfedés;
 * - legalább 100 karakteres chunk.
 *
 * Később a teszteredmények alapján módosíthatjuk ezeket.
 */
export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  maxChunkCharacters: 1200,
  overlapCharacters: 200,
  minChunkCharacters: 100,
};


/*
 * A szöveg normalizálása.
 *
 * A függvény:
 *
 * 1. egységesíti a Windows és Unix sortöréseket;
 * 2. eltávolítja a sorvégi felesleges szóközöket;
 * 3. legfeljebb két egymást követő üres sort hagy meg;
 * 4. eltávolítja a dokumentum eleji és végi üres helyeket.
 */
export function normalizeText(inputText: string): string {
  return inputText
    /*
     * A Windows CRLF és a régebbi CR sortöréseket
     * egységes Unix LF sortörésre alakítjuk.
     */
    .replace(/\r\n?/g, "\n")

    /*
     * Eltávolítjuk a sorok végén lévő szóközöket
     * és tabulátorokat.
     */
    .replace(/[ \t]+$/gm, "")

    /*
     * Három vagy több egymást követő sortörést
     * két sortörésre csökkentünk.
     */
    .replace(/\n{3,}/g, "\n\n")

    /*
     * A teljes szöveg elejéről és végéről
     * eltávolítjuk a felesleges whitespace karaktereket.
     */
    .trim();
}


/*
 * Becsült tokenszám meghatározása.
 *
 * A pontos tokenszám modellfüggő, és külön tokenizer
 * szükséges hozzá. Ebben a fázisban közelítő becslést
 * használunk.
 *
 * A Math.ceil biztosítja, hogy tört eredmény esetén
 * mindig felfelé kerekítsünk.
 */
export function estimateTokenCount(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}


/*
 * Egy hosszú bekezdés kisebb részekre bontása.
 *
 * Előfordulhat, hogy egyetlen bekezdés hosszabb,
 * mint az engedélyezett chunkméret. Ilyenkor
 * mondathatárok vagy szóhatárok mentén bontjuk fel.
 */
function splitLongParagraph(
  paragraph: string,
  maxChunkCharacters: number
): string[] {
  /*
   * Ha a bekezdés már megfelelő méretű,
   * nem szükséges feldarabolni.
   */
  if (paragraph.length <= maxChunkCharacters) {
    return [paragraph];
  }

  /*
   * Megpróbáljuk a szöveget mondatokra bontani.
   *
   * A reguláris kifejezés a mondatzáró írásjelek
   * utáni whitespace karaktereknél bont.
   */
  const sentences = paragraph.split(
    /(?<=[.!?])\s+/
  );

  const parts: string[] = [];
  let currentPart = "";

  for (const sentence of sentences) {
    /*
     * Ha egyetlen mondat önmagában is túl hosszú,
     * akkor szóhatárok alapján dolgozzuk fel.
     */
    if (sentence.length > maxChunkCharacters) {
      /*
       * Először elmentjük az addig összegyűjtött részt.
       */
      if (currentPart.trim().length > 0) {
        parts.push(currentPart.trim());
        currentPart = "";
      }

      const words = sentence.split(/\s+/);
      let wordPart = "";

      for (const word of words) {
        const candidate = wordPart
          ? `${wordPart} ${word}`
          : word;

        if (
          candidate.length > maxChunkCharacters &&
          wordPart.length > 0
        ) {
          parts.push(wordPart.trim());
          wordPart = word;
        } else {
          wordPart = candidate;
        }
      }

      if (wordPart.trim().length > 0) {
        parts.push(wordPart.trim());
      }

      continue;
    }

    /*
     * Megvizsgáljuk, hogy az új mondat még belefér-e
     * az aktuális részbe.
     */
    const candidate = currentPart
      ? `${currentPart} ${sentence}`
      : sentence;

    if (
      candidate.length > maxChunkCharacters &&
      currentPart.length > 0
    ) {
      parts.push(currentPart.trim());
      currentPart = sentence;
    } else {
      currentPart = candidate;
    }
  }

  /*
   * Az utolsó összegyűjtött részt is elmentjük.
   */
  if (currentPart.trim().length > 0) {
    parts.push(currentPart.trim());
  }

  return parts;
}


/*
 * Az előző chunk végéből átfedő szöveget készítünk.
 *
 * Nem vágunk el szót a közepén. A kiválasztott
 * szövegrész elejét a következő szóhatárig igazítjuk.
 */
function createOverlapText(
  previousChunk: string,
  overlapCharacters: number
): string {
  if (
    overlapCharacters <= 0 ||
    previousChunk.length === 0
  ) {
    return "";
  }

  /*
   * Az előző chunk végéből kiválasztjuk
   * a megadott maximális karakterszámot.
   */
  const rawOverlap = previousChunk.slice(
    -overlapCharacters
  );

  /*
   * Megkeressük az első whitespace karaktert,
   * hogy ne egy félbevágott szóval kezdődjön
   * a következő chunk.
   */
  const firstWhitespacePosition =
    rawOverlap.search(/\s/);

  if (firstWhitespacePosition === -1) {
    return rawOverlap.trim();
  }

  return rawOverlap
    .slice(firstWhitespacePosition + 1)
    .trim();
}


/*
 * A dokumentum feldarabolása.
 */
export function createTextChunks(
  inputText: string,
  options: Partial<ChunkingOptions> = {}
): TextChunk[] {
  /*
   * Az egyedi beállításokat összevonjuk
   * az alapértelmezett beállításokkal.
   */
  const finalOptions: ChunkingOptions = {
    ...DEFAULT_CHUNKING_OPTIONS,
    ...options,
  };

  /*
   * A beállítások ellenőrzése.
   */
  if (finalOptions.maxChunkCharacters <= 0) {
    throw new Error(
      "A maxChunkCharacters értékének pozitívnak kell lennie."
    );
  }

  if (finalOptions.overlapCharacters < 0) {
    throw new Error(
      "Az overlapCharacters értéke nem lehet negatív."
    );
  }

  if (
    finalOptions.overlapCharacters >=
    finalOptions.maxChunkCharacters
  ) {
    throw new Error(
      "Az overlapCharacters értékének kisebbnek kell lennie a maxChunkCharacters értékénél."
    );
  }

  if (finalOptions.minChunkCharacters < 0) {
    throw new Error(
      "A minChunkCharacters értéke nem lehet negatív."
    );
  }

  /*
   * A bemeneti szöveg normalizálása.
   */
  const normalizedText = normalizeText(inputText);

  /*
   * Üres bemenetnél üres tömböt adunk vissza.
   */
  if (normalizedText.length === 0) {
    return [];
  }

  /*
   * A dokumentumot üres sorok mentén
   * bekezdésekre bontjuk.
   */
  const originalParagraphs = normalizedText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  /*
   * A túl hosszú bekezdéseket kisebb részekre bontjuk.
   */
  const paragraphs = originalParagraphs.flatMap(
    (paragraph) =>
      splitLongParagraph(
        paragraph,
        finalOptions.maxChunkCharacters
      )
  );

  /*
   * Az elkészített nyers chunkszövegek.
   */
  const rawChunks: string[] = [];

  /*
   * Az aktuálisan épülő chunk.
   */
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    /*
     * Az aktuális chunk és az új bekezdés között
     * két sortörést használunk.
     */
    const candidate = currentChunk
      ? `${currentChunk}\n\n${paragraph}`
      : paragraph;

    /*
     * Ha az új bekezdés még belefér, hozzáadjuk
     * az aktuális chunkhoz.
     */
    if (
      candidate.length <=
      finalOptions.maxChunkCharacters
    ) {
      currentChunk = candidate;
      continue;
    }

    /*
     * Ha az aktuális chunk már tartalmaz szöveget,
     * elmentjük.
     */
    if (currentChunk.trim().length > 0) {
      rawChunks.push(currentChunk.trim());
    }

    /*
     * Az előző chunk végéből elkészítjük az átfedést.
     */
    const previousChunk =
      rawChunks[rawChunks.length - 1] ?? "";

    const overlapText = createOverlapText(
      previousChunk,
      finalOptions.overlapCharacters
    );

    /*
     * Az új chunk az átfedéssel és az új
     * bekezdéssel kezdődik.
     */
    currentChunk = overlapText
      ? `${overlapText}\n\n${paragraph}`
      : paragraph;

    /*
     * Biztonsági eset:
     *
     * Ha az átfedés miatt az új chunk még mindig
     * túl hosszú, az átfedést elhagyjuk.
     */
    if (
      currentChunk.length >
      finalOptions.maxChunkCharacters
    ) {
      currentChunk = paragraph;
    }
  }

  /*
   * Az utolsó chunkot is elmentjük.
   */
  if (currentChunk.trim().length > 0) {
    rawChunks.push(currentChunk.trim());
  }

  /*
   * Ha az utolsó chunk nagyon rövid, megpróbáljuk
   * hozzáilleszteni az előző chunkhoz.
   */
  if (
    rawChunks.length > 1 &&
    rawChunks[rawChunks.length - 1].length <
      finalOptions.minChunkCharacters
  ) {
    const lastChunk = rawChunks.pop();

    if (lastChunk) {
      const previousIndex = rawChunks.length - 1;
      const mergedChunk =
        `${rawChunks[previousIndex]}\n\n${lastChunk}`;

      /*
       * Csak akkor vonjuk össze, ha az eredmény
       * nem lépi túl jelentősen a maximális méretet.
       */
      if (
        mergedChunk.length <=
        finalOptions.maxChunkCharacters
      ) {
        rawChunks[previousIndex] = mergedChunk;
      } else {
        rawChunks.push(lastChunk);
      }
    }
  }

  /*
   * A chunkszövegekből elkészítjük a részletes,
   * metaadatokat is tartalmazó eredményt.
   */
  let searchStartPosition = 0;

  return rawChunks.map((content, chunkIndex) => {
    /*
     * Megkeressük a chunk pozícióját a normalizált
     * dokumentumban.
     *
     * Átfedés esetén előfordulhat, hogy ugyanaz a
     * szövegrész több helyen is szerepel. Ezért a
     * keresést az előző pozíció közeléből indítjuk.
     */
    let startPosition = normalizedText.indexOf(
      content,
      searchStartPosition
    );

    /*
     * Ha az átfedés miatt a teljes chunk pontosan
     * nem található meg, a chunk elejének egy részét
     * próbáljuk megkeresni.
     */
    if (startPosition === -1) {
      const searchableBeginning = content.slice(
        0,
        Math.min(100, content.length)
      );

      startPosition = normalizedText.indexOf(
        searchableBeginning
      );
    }

    /*
     * Ha továbbra sem található, biztonságos
     * tartalékértéket használunk.
     */
    if (startPosition === -1) {
      startPosition = searchStartPosition;
    }

    const endPosition =
      startPosition + content.length;

    searchStartPosition = Math.max(
      startPosition + 1,
      endPosition -
        finalOptions.overlapCharacters
    );

    return {
      chunkIndex,
      content,
      characterCount: content.length,
      estimatedTokenCount:
        estimateTokenCount(content),
      startPosition,
      endPosition,
    };
  });
}