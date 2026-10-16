import OpenAI from "openai";

/*
 * Az embeddingmodell alapértelmezett neve.
 *
 * Ha az OPENAI_EMBEDDING_MODEL környezeti változó
 * nincs beállítva, akkor ezt a modellt használjuk.
 */
const DEFAULT_EMBEDDING_MODEL =
  "text-embedding-3-small";

/*
 * A text-embedding-3-small modell alapértelmezett
 * embeddingmérete 1536.
 *
 * Ennek meg kell egyeznie a PostgreSQL-adatbázisban
 * létrehozott VECTOR(1536) mező méretével.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/*
 * Az OpenAI kliens kezdetben nem létezik.
 *
 * Csak az első valódi OpenAI API-híváskor hozzuk létre.
 * Ez azt jelenti, hogy a projekt olyan részei is
 * betölthetők, amelyek nem használnak OpenAI API-t.
 */
let openAIClient: OpenAI | null = null;

/*
 * Visszaadja a konfigurált embeddingmodell nevét.
 *
 * Elsőként megpróbálja beolvasni az értéket az
 * OPENAI_EMBEDDING_MODEL környezeti változóból.
 *
 * Ha a környezeti változó nincs beállítva vagy üres,
 * az alapértelmezett text-embedding-3-small
 * modellt használja.
 */
export function getEmbeddingModel(): string {
  return (
    process.env.OPENAI_EMBEDDING_MODEL?.trim() ||
    DEFAULT_EMBEDDING_MODEL
  );
}

/*
 * Létrehozza vagy visszaadja a már korábban
 * létrehozott OpenAI API-klienst.
 *
 * A függvény nem exportált, ezért csak ebben
 * a modulban használható.
 */
export function getOpenAIClient(): OpenAI {
  /*
   * Ha a kliens már létezik, nem hozunk létre
   * új példányt.
   */
  if (openAIClient) {
    return openAIClient;
  }

  /*
   * Az API-kulcsot kizárólag a szerveroldali
   * környezeti változóból olvassuk be.
   *
   * Az API-kulcs a helyi .env fájlban található.
   */
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  /*
   * Érthető hibaüzenetet adunk, ha hiányzik
   * az API-kulcs.
   */
  if (!apiKey) {
    throw new Error(
      "Az OPENAI_API_KEY környezeti változó nincs beállítva."
    );
  }

  /*
   * Az OpenAI kliens létrehozása.
   */
  openAIClient = new OpenAI({
    apiKey,
  });

  return openAIClient;
}

/*
 * Egyetlen szöveg embeddingjének létrehozása.
 *
 * Ezt a függvényt például rövid tesztekhez vagy
 * egyetlen felhasználói kérdés embeddingjének
 * elkészítéséhez használhatjuk.
 *
 * Paraméter:
 *
 * inputText:
 *   Az embeddinggé alakítandó szöveg.
 *
 * Visszatérési érték:
 *
 * Promise<number[]>:
 *   Egy 1536 elemű lebegőpontos számtömb.
 */
export async function createEmbedding(
  inputText: string
): Promise<number[]> {
  /*
   * A szöveg elejéről és végéről eltávolítjuk
   * a fölösleges whitespace karaktereket.
   */
  const normalizedInput = inputText.trim();

  /*
   * Üres szöveghez nem készítünk embeddinget.
   */
  if (normalizedInput.length === 0) {
    throw new Error(
      "Üres szöveghez nem generálható embedding."
    );
  }

  /*
   * OpenAI kliens és modellnév lekérése.
   */
  const client = getOpenAIClient();
  const model = getEmbeddingModel();

  /*
   * Embeddingkérés elküldése az OpenAI API-nak.
   *
   * Az encoding_format: "float" miatt az API
   * lebegőpontos számtömböt ad vissza.
   */
  const response = await client.embeddings.create({
    model,
    input: normalizedInput,
    encoding_format: "float",
  });

  /*
   * Egyetlen szöveget küldtünk, ezért az első
   * válaszelem tartalmazza a szükséges embeddinget.
   */
  const embedding = response.data[0]?.embedding;

  /*
   * Hibát jelzünk, ha az API nem adott vissza
   * embeddingvektort.
   */
  if (!embedding) {
    throw new Error(
      "Az OpenAI API nem adott vissza embeddingvektort."
    );
  }

  /*
   * Ellenőrizzük, hogy az embedding dimenziója
   * megfelel-e a PostgreSQL VECTOR(1536) mezőjének.
   */
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Nem megfelelő embeddingméret. Várt: ${EMBEDDING_DIMENSIONS}, kapott: ${embedding.length}.`
    );
  }

  return embedding;
}

/*
 * Több szöveg embeddingjének létrehozása
 * egyetlen OpenAI API-kérésben.
 *
 * Ez gyorsabb és gazdaságosabb, mint minden chunkhoz
 * külön API-kérést indítani.
 *
 * Paraméter:
 *
 * inputTexts:
 *   A feldolgozandó chunkszövegek tömbje.
 *
 * Visszatérési érték:
 *
 * Promise<number[][]>:
 *   Embeddingvektorok tömbje.
 *
 * A visszaadott embeddingek sorrendje megegyezik
 * a bemeneti szövegek sorrendjével.
 */
export async function createEmbeddings(
  inputTexts: string[]
): Promise<number[][]> {
  /*
   * Üres bemeneti tömb esetén nincs feldolgozandó
   * szöveg, ezért üres tömböt adunk vissza.
   *
   * Ilyenkor nem indítunk OpenAI API-hívást.
   */
  if (inputTexts.length === 0) {
    return [];
  }

  /*
   * Minden szöveg elejéről és végéről eltávolítjuk
   * a fölösleges whitespace karaktereket.
   */
  const normalizedInputs = inputTexts.map(
    (inputText) => inputText.trim()
  );

  /*
   * Megkeressük, hogy van-e üres szöveg
   * a bemeneti tömbben.
   */
  const emptyInputIndex = normalizedInputs.findIndex(
    (inputText) => inputText.length === 0
  );

  /*
   * Egyetlen üres chunkhoz sem készítünk embeddinget.
   *
   * A hibaüzenet tartalmazza a hibás elem indexét,
   * így könnyebb megtalálni a problémás chunkot.
   */
  if (emptyInputIndex !== -1) {
    throw new Error(
      `A(z) ${emptyInputIndex}. indexű chunk üres, ezért nem generálható hozzá embedding.`
    );
  }

  /*
   * OpenAI kliens és modellnév lekérése.
   */
  const client = getOpenAIClient();
  const model = getEmbeddingModel();

  /*
   * Az OpenAI embedding API egyszerre több szöveget
   * is képes fogadni.
   */
  const response = await client.embeddings.create({
    model,
    input: normalizedInputs,
    encoding_format: "float",
  });

  /*
   * Az API válaszelemeit index szerint rendezzük.
   *
   * Ezzel biztosítjuk, hogy az embeddingek sorrendje
   * pontosan megegyezzen a bemeneti chunkok sorrendjével.
   */
  const sortedEmbeddingData = [...response.data].sort(
    (firstItem, secondItem) =>
      firstItem.index - secondItem.index
  );

  /*
   * A teljes válaszból csak az embeddingvektorokat
   * tartjuk meg.
   */
  const embeddings = sortedEmbeddingData.map(
    (embeddingData) => embeddingData.embedding
  );

  /*
   * Ellenőrizzük, hogy minden bemeneti szöveghez
   * pontosan egy embedding érkezett-e.
   */
  if (embeddings.length !== normalizedInputs.length) {
    throw new Error(
      `Nem megfelelő számú embedding érkezett. Várt: ${normalizedInputs.length}, kapott: ${embeddings.length}.`
    );
  }

  /*
   * Minden visszakapott embedding méretét
   * külön ellenőrizzük.
   */
  embeddings.forEach(
    (embedding, embeddingIndex) => {
      if (
        embedding.length !== EMBEDDING_DIMENSIONS
      ) {
        throw new Error(
          `Nem megfelelő embeddingméret a(z) ${embeddingIndex}. indexnél. Várt: ${EMBEDDING_DIMENSIONS}, kapott: ${embedding.length}.`
        );
      }
    }
  );

  return embeddings;
}