import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createTextChunks,
  normalizeText,
} from "../lib/chunking";

/*
 * A main függvény tartalmazza a teszt teljes folyamatát.
 *
 * Az async kulcsszó azért szükséges, mert a receptfájl
 * beolvasásánál az await operátort használjuk.
 *
 * A kódot függvénybe helyezzük, mert CommonJS futtatási
 * módban a felső szintű await nem támogatott.
 */
async function main(): Promise<void> {
  /*
   * A teszteléshez a korábban létrehozott
   * paradicsomos receptfájlt használjuk.
   */
  const testFilePath = path.join(
    process.cwd(),
    "test-data",
    "test-recipe.txt"
  );

  /*
   * A tesztfájl UTF-8 szövegként történő beolvasása.
   */
  const originalText = await readFile(
    testFilePath,
    "utf-8"
  );

  /*
   * A normalizált szöveg előállítása.
   */
  const normalizedText = normalizeText(originalText);

  /*
   * A tesztrecept rövid, ezért kisebb chunkméretet
   * használunk, hogy biztosan több chunk keletkezzen.
   *
   * A végleges alkalmazás alapértelmezett mérete
   * továbbra is 1200 karakter lesz.
   */
  const chunks = createTextChunks(normalizedText, {
    maxChunkCharacters: 250,
    overlapCharacters: 50,
    minChunkCharacters: 50,
  });

  /*
   * A teszt összefoglaló információinak kiírása.
   */
  console.log("Chunking teszt");
  console.log("==============================");

  console.log(
    `Eredeti karakterszám: ${originalText.length}`
  );

  console.log(
    `Normalizált karakterszám: ${normalizedText.length}`
  );

  console.log(
    `Létrehozott chunkok: ${chunks.length}`
  );

  console.log("==============================");

  /*
   * Minden chunk részletes adatainak kiírása.
   */
  for (const chunk of chunks) {
    console.log("");

    console.log(
      `CHUNK ${chunk.chunkIndex}`
    );

    console.log(
      `Karakterszám: ${chunk.characterCount}`
    );

    console.log(
      `Becsült tokenszám: ${chunk.estimatedTokenCount}`
    );

    console.log(
      `Pozíció: ${chunk.startPosition}-${chunk.endPosition}`
    );

    console.log("------------------------------");
    console.log(chunk.content);
    console.log("------------------------------");
  }
}

/*
 * Elindítjuk a teszt fő függvényét.
 *
 * Ha a fájl beolvasása vagy a chunking közben hiba történik,
 * a hibát kiírjuk a terminálba, majd 1-es kilépési kódot
 * állítunk be.
 *
 * Az 1-es kilépési kód azt jelzi az operációs rendszernek,
 * hogy a teszt sikertelenül fejeződött be.
 */
main().catch((error: unknown) => {
  console.error("A chunking teszt sikertelen:", error);
  process.exitCode = 1;
});