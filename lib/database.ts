import { Pool } from "pg";

/*
 * A DATABASE_URL környezeti változó tartalmazza
 * a PostgreSQL teljes kapcsolati címét.
 *
 * A Next.js ezt az értéket a helyi .env fájlból olvassa be.
 * A .env fájl nem kerülhet GitHubra, mert valódi
 * adatbázisjelszót tartalmaz.
 */
const databaseUrl = process.env.DATABASE_URL;

/*
 * Ha a DATABASE_URL nincs beállítva, az alkalmazás
 * nem tud kapcsolódni az adatbázishoz.
 *
 * Ebben az esetben azonnal egyértelmű hibaüzenetet adunk.
 */
if (!databaseUrl) {
  throw new Error(
    "A DATABASE_URL környezeti változó nincs beállítva. Ellenőrizd a projekt .env fájlját."
  );
}

/*
 * Fejlesztői módban a Next.js a forrásfájlok módosításakor
 * újratöltheti a szerveroldali modulokat.
 *
 * Ha minden újratöltéskor új kapcsolatkészlet jönne létre,
 * idővel túl sok adatbázis-kapcsolat nyílhatna meg.
 *
 * Ezért fejlesztői környezetben a kapcsolatkészletet
 * a Node.js globális objektumában is megőrizzük.
 */
const globalForDatabase = globalThis as unknown as {
  databasePool: Pool | undefined;
};

/*
 * Ha már létezik kapcsolatkészlet, azt használjuk.
 * Ellenkező esetben létrehozunk egy újat.
 */
export const databasePool =
  globalForDatabase.databasePool ??
  new Pool({
    /*
     * A PostgreSQL kapcsolati címe a .env fájlból.
     */
    connectionString: databaseUrl,

    /*
     * A kapcsolatkészlet egyszerre legfeljebb
     * tíz aktív adatbázis-kapcsolatot kezel.
     */
    max: 10,

    /*
     * A harminc másodpercig nem használt kapcsolatokat
     * a kapcsolatkészlet bezárhatja.
     */
    idleTimeoutMillis: 30_000,

    /*
     * Ha öt másodpercen belül nem sikerül kapcsolódni,
     * a kliens kapcsolódási hibát jelez.
     */
    connectionTimeoutMillis: 5_000,
  });

/*
 * Fejlesztői környezetben eltároljuk a kapcsolatkészletet
 * a globális objektumban, hogy a Next.js újratöltései során
 * ugyanazt a poolt használhassuk.
 */
if (process.env.NODE_ENV !== "production") {
  globalForDatabase.databasePool = databasePool;
}