import { NextResponse } from "next/server";

import { databasePool } from "@/lib/database";

/*
 * Ez az interfész leírja az adatbázisból
 * visszakapott sor szerkezetét.
 */
interface DatabaseHealthRow {
  database_name: string;
  database_time: Date;
  postgres_version: string;
  pgvector_version: string | null;
}

/*
 * GET /api/health
 *
 * Ez az API-végpont a következőket ellenőrzi:
 *
 * 1. működik-e a Next.js backend;
 * 2. elérhető-e a PostgreSQL-adatbázis;
 * 3. melyik adatbázishoz kapcsolódtunk;
 * 4. milyen PostgreSQL-verzió fut;
 * 5. aktív-e a pgvector extension.
 */
export async function GET() {
  try {
    /*
     * A lekérdezés egyszerre ellenőrzi:
     *
     * - az adatbázis-kapcsolatot;
     * - a PostgreSQL-verziót;
     * - a pgvector extension jelenlétét.
     *
     * A LEFT JOIN miatt akkor is kapunk eredményt,
     * ha a vector extension nincs aktiválva.
     */
    const result = await databasePool.query<DatabaseHealthRow>(`
      SELECT
        current_database() AS database_name,
        NOW() AS database_time,
        current_setting('server_version') AS postgres_version,
        extension.extversion AS pgvector_version
      FROM (SELECT 1) AS health_check
      LEFT JOIN pg_extension AS extension
        ON extension.extname = 'vector';
    `);

    /*
     * A lekérdezés egyetlen sort ad vissza.
     */
    const databaseInformation = result.rows[0];

    /*
     * Ellenőrizzük, hogy van-e telepített pgvector-verzió.
     */
    const isPgvectorAvailable =
      databaseInformation.pgvector_version !== null;

    /*
     * Sikeres válasz.
     */
    return NextResponse.json(
      {
        status: isPgvectorAvailable ? "healthy" : "degraded",
        application: "smt-technical-assistant",
        database: {
          connected: true,
          name: databaseInformation.database_name,
          serverTime: databaseInformation.database_time,
          postgresVersion: databaseInformation.postgres_version,
        },
        pgvector: {
          installed: isPgvectorAvailable,
          version: databaseInformation.pgvector_version,
        },
      },
      {
        status: isPgvectorAvailable ? 200 : 503,
      }
    );
  } catch (error) {
    /*
     * A részletes technikai hibát csak a szerver termináljába írjuk.
     */
    console.error("Database health check failed:", error);

    /*
     * A böngészőnek nem küldjük vissza a teljes technikai hibát,
     * mert az belső vagy érzékeny információkat tartalmazhatna.
     */
    return NextResponse.json(
      {
        status: "unhealthy",
        application: "smt-technical-assistant",
        database: {
          connected: false,
        },
        pgvector: {
          installed: false,
          version: null,
        },
        message:
          "Az alkalmazás nem tudott kapcsolódni a PostgreSQL-adatbázishoz.",
      },
      {
        status: 503,
      }
    );
  }
}