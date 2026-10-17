# SMT Műszaki Asszisztens és Evaluációs Központ

A projekt egy Next.js és TypeScript alapú RAG-webalkalmazás SMT-, ESD-, berendezés-, karbantartási és gyártási dokumentumok lekérdezésére.

## Dokumentáció

- `README_AI-Assistant_SMT.md`: az asszisztens részletes működése
- `README_Evaluation_SMT.md`: az evaluációs rendszer leírása
- `requirements_SMT.txt`: technológiák és előfeltételek

## Fő funkciók

- TXT, MD, PDF, DOCX és XLSX dokumentumok kezelése
- PostgreSQL és pgvector alapú szemantikus keresés
- magyar és angol keresőkérdések együttes használata
- összes vagy kiválasztott dokumentumra korlátozott keresés
- dokumentum-, modell- és hibrid tudásforrásmód
- menthető többfordulós beszélgetések
- PDF-oldalszám, XLSX-munkalap és sortartomány megjelenítése
- Single-turn, A/B, Multi-turn és RAG-evaluáció
- User Simulator, LLM-as-Judge és emberi felülvizsgálat

## Indítás

```powershell
npm install
docker compose up -d
npm run dev
```

Alapértelmezett cím:

```text
http://localhost:3000
```

## Környezeti változók

```env
POSTGRES_PASSWORD=helyi_jelszo
DATABASE_URL=postgresql://felhasznalo:jelszo@localhost:5432/adatbazis
OPENAI_API_KEY=OpenAI_API_kulcs
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini
SYSTEM_PROMPT_VARIANT=strict
RAG_RETRIEVAL_DEBUG=false
```

A `.env` fájlt tilos Gitre feltölteni.

## Ellenőrzés

```powershell
npm run lint
npm run build
```
