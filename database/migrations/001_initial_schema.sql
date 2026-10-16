/*
 * SMT Technical Assistant
 * Initial database schema
 */

CREATE EXTENSION IF NOT EXISTS vector;


/*
 * Dokumentumfeldolgozasi allapotok.
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
 * Feltoltott SMT dokumentumok.
 */
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    original_filename TEXT NOT NULL,

    title TEXT,

    mime_type TEXT NOT NULL,

    content TEXT NOT NULL,

    content_hash TEXT NOT NULL,

    status document_status NOT NULL DEFAULT 'uploaded',

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    processed_at TIMESTAMPTZ
);


CREATE UNIQUE INDEX IF NOT EXISTS
    documents_content_hash_unique_index
ON documents (content_hash);


CREATE INDEX IF NOT EXISTS
    documents_status_index
ON documents (status);


CREATE INDEX IF NOT EXISTS
    documents_created_at_index
ON documents (created_at DESC);


/*
 * A dokumentumokbol keszitett keresheto szovegreszletek.
 */
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    document_id UUID NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,

    content TEXT NOT NULL,

    character_count INTEGER NOT NULL,

    token_count INTEGER,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    embedding VECTOR(1536),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT document_chunks_document_index_unique
        UNIQUE (document_id, chunk_index),

    CONSTRAINT document_chunks_character_count_valid
        CHECK (character_count >= 0),

    CONSTRAINT document_chunks_token_count_valid
        CHECK (token_count IS NULL OR token_count >= 0),

    CONSTRAINT document_chunks_chunk_index_valid
        CHECK (chunk_index >= 0)
);


CREATE INDEX IF NOT EXISTS
    document_chunks_document_id_index
ON document_chunks (document_id);


CREATE INDEX IF NOT EXISTS
    document_chunks_embedding_hnsw_index
ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;


/*
 * Tartosan elmentett beszelgetesek.
 */
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title TEXT NOT NULL DEFAULT 'Uj beszelgetes',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS
    chat_sessions_updated_at_index
ON chat_sessions (updated_at DESC);


/*
 * A beszelgetesekhez tartozo felhasznaloi
 * es asszisztensi uzenetek.
 */
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    chat_session_id UUID NOT NULL
        REFERENCES chat_sessions(id)
        ON DELETE CASCADE,

    role TEXT NOT NULL,

    content TEXT NOT NULL,

    sources JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chat_messages_role_valid
        CHECK (role IN ('user', 'assistant', 'system'))
);


CREATE INDEX IF NOT EXISTS
    chat_messages_session_id_index
ON chat_messages (chat_session_id);


CREATE INDEX IF NOT EXISTS
    chat_messages_created_at_index
ON chat_messages (created_at);