/*
 * AI Recipe Assistant
 * Initial database schema
 *
 * Ez a migráció létrehozza:
 *
 * 1. a pgvector extensiont;
 * 2. a dokumentumok tábláját;
 * 3. a dokumentumchunkok tábláját;
 * 4. az alapvető adatbázis-indexeket;
 * 5. a vektoros HNSW keresési indexet.
 */


/*
 * A vector extension biztosítja:
 *
 * - a vector adattípust;
 * - a vektortávolság-operátorokat;
 * - a HNSW és IVFFlat vektorindexeket.
 *
 * Az IF NOT EXISTS miatt a migráció akkor sem hibázik,
 * ha az extension már korábban aktiválva lett.
 */
CREATE EXTENSION IF NOT EXISTS vector;


/*
 * A dokumentumfeldolgozás lehetséges állapotai.
 *
 * uploaded:
 *   A fájl feltöltődött, de még nincs feldolgozva.
 *
 * processing:
 *   A chunking és embeddinggenerálás folyamatban van.
 *
 * completed:
 *   A feldolgozás sikeresen befejeződött.
 *
 * failed:
 *   A feldolgozás során hiba történt.
 */
DO $$
BEGIN
    CREATE TYPE document_status AS ENUM (
        'uploaded',
        'processing',
        'completed',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END
$$;


/*
 * A documents tábla a feltöltött vagy importált
 * dokumentumok alapadatait tárolja.
 *
 * Egy dokumentum lehet például:
 *
 * - egyetlen recept;
 * - több receptet tartalmazó szövegfájl;
 * - a korábbi recept-adatbázisból importált adatrekord.
 */
CREATE TABLE IF NOT EXISTS documents (
    /*
     * A dokumentum egyedi azonosítója.
     */
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    /*
     * A feltöltött fájl eredeti neve.
     */
    original_filename TEXT NOT NULL,

    /*
     * A dokumentum megjelenítendő címe.
     *
     * Ez eltérhet a fájlnévtől. Egy recept esetén
     * például maga a recept neve lehet.
     */
    title TEXT,

    /*
     * A fájl MIME-típusa.
     *
     * Például:
     * text/plain
     * text/markdown
     */
    mime_type TEXT NOT NULL,

    /*
     * A dokumentum teljes, feldolgozás előtti szövege.
     */
    content TEXT NOT NULL,

    /*
     * A tartalom hashértéke.
     *
     * Ezzel később felismerhetjük, ha ugyanazt
     * a dokumentumot többször próbálják feltölteni.
     */
    content_hash TEXT NOT NULL,

    /*
     * A dokumentum feldolgozási állapota.
     */
    status document_status NOT NULL DEFAULT 'uploaded',

    /*
     * A dokumentumhoz kapcsolódó rugalmas metaadatok.
     *
     * Itt tárolható például:
     *
     * - a recept kategóriája;
     * - az adatforrás;
     * - az adagok száma;
     * - a recept szerzője;
     * - az importfolyamat neve.
     */
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    /*
     * Ha a feldolgozás sikertelen, itt tároljuk
     * a rövid technikai hibaüzenetet.
     */
    error_message TEXT,

    /*
     * A feltöltés időpontja.
     */
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    /*
     * Az utolsó módosítás időpontja.
     */
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    /*
     * A sikeres feldolgozás befejezési időpontja.
     */
    processed_at TIMESTAMPTZ
);


/*
 * Egy azonos tartalmú dokumentum csak egyszer szerepelhet.
 *
 * Az egyediség nem a fájlnéven, hanem a tartalom
 * hashértékén alapul.
 */
CREATE UNIQUE INDEX IF NOT EXISTS
    documents_content_hash_unique_index
ON documents (content_hash);


/*
 * Gyorsabb szűrés a feldolgozási állapot alapján.
 */
CREATE INDEX IF NOT EXISTS
    documents_status_index
ON documents (status);


/*
 * Gyorsabb időrendi dokumentumlista.
 */
CREATE INDEX IF NOT EXISTS
    documents_created_at_index
ON documents (created_at DESC);


/*
 * A document_chunks tábla tartalmazza a dokumentumokból
 * előállított kereshető szövegrészleteket.
 */
CREATE TABLE IF NOT EXISTS document_chunks (
    /*
     * A chunk egyedi azonosítója.
     */
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    /*
     * Kapcsolat a forrásdokumentummal.
     *
     * Az ON DELETE CASCADE azt jelenti, hogy a dokumentum
     * törlésekor a hozzá tartozó chunkok is törlődnek.
     */
    document_id UUID NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,

    /*
     * A chunk sorszáma a dokumentumon belül.
     *
     * Az első chunk sorszáma 0 lesz.
     */
    chunk_index INTEGER NOT NULL,

    /*
     * A tényleges, kereshető szövegrészlet.
     */
    content TEXT NOT NULL,

    /*
     * A chunk karakterszáma.
     */
    character_count INTEGER NOT NULL,

    /*
     * A becsült vagy pontos tokenszám.
     *
     * Kezdetben lehet NULL, amíg a feldolgozó
     * szolgáltatás nem számítja ki.
     */
    token_count INTEGER,

    /*
     * A chunkhoz tartozó rugalmas metaadatok.
     *
     * Itt tárolható például:
     *
     * - a recept neve;
     * - a recept kategóriája;
     * - a szakasz neve;
     * - a chunking stratégia verziója;
     * - az embeddingmodell neve.
     */
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    /*
     * A text-embedding-3-small modellhez tartozó
     * 1536 dimenziós embeddingvektor.
     *
     * Feltöltéskor még lehet NULL. Az embeddinggenerálás
     * után kap értéket.
     */
    embedding VECTOR(1536),

    /*
     * A chunk létrehozási időpontja.
     */
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    /*
     * Ugyanazon dokumentumon belül ugyanaz a chunk_index
     * csak egyszer szerepelhet.
     */
    CONSTRAINT document_chunks_document_index_unique
        UNIQUE (document_id, chunk_index),

    /*
     * A karakterszám nem lehet negatív.
     */
    CONSTRAINT document_chunks_character_count_valid
        CHECK (character_count >= 0),

    /*
     * A tokenszám, ha ismert, nem lehet negatív.
     */
    CONSTRAINT document_chunks_token_count_valid
        CHECK (token_count IS NULL OR token_count >= 0),

    /*
     * A chunk_index nem lehet negatív.
     */
    CONSTRAINT document_chunks_chunk_index_valid
        CHECK (chunk_index >= 0)
);


/*
 * Gyorsabb chunklekérdezés dokumentumazonosító alapján.
 */
CREATE INDEX IF NOT EXISTS
    document_chunks_document_id_index
ON document_chunks (document_id);


/*
 * HNSW vektorindex a cosine distance alapú
 * szemantikus kereséshez.
 *
 * A vector_cosine_ops azt jelenti, hogy az indexet
 * cosine distance kereséshez optimalizáljuk.
 *
 * Az indexben csak azok a sorok szerepelnek,
 * amelyek már rendelkeznek embeddinggel.
 */
CREATE INDEX IF NOT EXISTS
    document_chunks_embedding_hnsw_index
ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;