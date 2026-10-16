/*
 * A dotenv/config a projekt gyökerében található
 * .env fájlból betölti a környezeti változókat.
 *
 * Ez kizárólag az önálló tesztszkripthez szükséges.
 * A Next.js a saját futtatása során automatikusan
 * kezeli a .env fájlt.
 */
import "dotenv/config";

import {
  createEmbedding,
  EMBEDDING_DIMENSIONS,
  getEmbeddingModel,
} from "../lib/openai";

/*
 * A teszt teljes folyamatát async függvényben futtatjuk.
 */
async function main(): Promise<void> {
  /*
   * Rövid tesztszöveget használunk, hogy az API-hívás
   * tokenfelhasználása és költsége minimális legyen.
   */
  const testText =
    "Paradicsomos tészta fokhagymával és bazsalikommal.";

  console.log("OpenAI embedding teszt");
  console.log("==============================");
  console.log(`Modell: ${getEmbeddingModel()}`);
  console.log(`Várt dimenzió: ${EMBEDDING_DIMENSIONS}`);
  console.log(`Tesztszöveg: ${testText}`);
  console.log("");
  console.log("Embedding generálása folyamatban...");

  /*
   * Az első valódi OpenAI embedding API-hívás.
   */
  const embedding = await createEmbedding(testText);

  console.log("");
  console.log("Embedding sikeresen elkészült.");
  console.log(`Kapott dimenzió: ${embedding.length}`);

  /*
   * Ellenőrzési célból csak az első öt értéket írjuk ki.
   *
   * A teljes 1536 elemű vektor kiírására nincs szükség.
   */
  console.log(
    "Az embedding első 5 eleme:",
    embedding.slice(0, 5)
  );
}

/*
 * A teszt elindítása és a hibák központi kezelése.
 */
main().catch((error: unknown) => {
  /*
   * Nem írjuk ki az API-kulcsot vagy a teljes
   * környezeti konfigurációt.
   */
  if (error instanceof Error) {
    console.error(
      "Az embedding teszt sikertelen:",
      error.message
    );
  } else {
    console.error(
      "Az embedding teszt ismeretlen hibával leállt."
    );
  }

  process.exitCode = 1;
});