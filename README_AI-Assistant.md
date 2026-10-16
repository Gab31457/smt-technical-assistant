# AI Receptasszisztens

Next.js, TypeScript, OpenAI, PostgreSQL és pgvector technológiákra épülő Retrieval-Augmented Generation, röviden RAG webalkalmazás.

Az alkalmazás Markdown és egyszerű szöveges receptdokumentumok feltöltését, feldolgozását, szemantikus keresését és természetes nyelvű lekérdezését támogatja. A felhasználó magyar vagy angol nyelven tehet fel kérdéseket, a rendszer pedig a feltöltött receptforrások alapján készít választ.

> **Fontos:** az alkalmazás válaszai kizárólag tájékoztató jellegűek. Allergia, intolerancia vagy más egészségügyi szempont esetén mindig ellenőrizni kell az eredeti recept hozzávalóit és a felhasznált termékek csomagolását.

---

## Tartalomjegyzék

- [A projekt célja](#a-projekt-célja)
- [Fő funkciók](#fő-funkciók)
- [Technológiai környezet](#technológiai-környezet)
- [Rendszerarchitektúra](#rendszerarchitektúra)
- [Projektstruktúra](#projektstruktúra)
- [Előfeltételek](#előfeltételek)
- [Telepítés](#telepítés)
- [Környezeti változók](#környezeti-változók)
- [Adatbázis indítása](#adatbázis-indítása)
- [Adatbázis-migráció](#adatbázis-migráció)
- [Az alkalmazás futtatása](#az-alkalmazás-futtatása)
- [Használat](#használat)
- [System prompt változatok](#system-prompt-változatok)
- [API-végpontok](#api-végpontok)
- [RAG-feldolgozási folyamat](#rag-feldolgozási-folyamat)
- [Tesztelés](#tesztelés)
- [Tesztelési eredmények összefoglalása](#tesztelési-eredmények-összefoglalása)
- [Biztonság](#biztonság)
- [Gyakori hibák és megoldások](#gyakori-hibák-és-megoldások)
- [Git használata](#git-használata)
- [Korlátozások](#korlátozások)
- [Tanulságok](#tanulságok)
- [Továbbfejlesztési lehetőségek](#továbbfejlesztési-lehetőségek)
- [Szerző](#szerző)

---

## A projekt célja

A projekt célja egy teljes, böngészőből használható RAG-alapú receptasszisztens megvalósítása.

A rendszer:

1. receptdokumentumokat fogad `.txt` és `.md` formátumban;
2. eltárolja az eredeti dokumentumokat PostgreSQL adatbázisban;
3. kisebb, részben átfedő szövegrészekre bontja a dokumentumokat;
4. OpenAI embeddingeket generál a szövegrészekhez;
5. az embeddingeket pgvector mezőkben tárolja;
6. szemantikus kereséssel releváns receptrészleteket keres;
7. a megtalált források alapján OpenAI segítségével magyar vagy angol nyelvű választ készít;
8. megjeleníti a válaszhoz felhasznált receptforrásokat.

A kész alkalmazás működéséhez nincs szükség JupyterLabra, Pythonra vagy Qdrantra. A teljes feldolgozási folyamat TypeScriptben, a Next.js alkalmazáson belül fut.

---

## Fő funkciók

- `.txt` és `.md` receptdokumentumok feltöltése
- UTF-8 szövegkódolás ellenőrzése
- 1 MB-os fájlméretkorlát
- duplikált tartalom felismerése SHA-256 hash alapján
- dokumentumok listázása
- dokumentumok törlése
- dokumentumok újrafeldolgozása hiba után
- bekezdésalapú, átfedést használó chunking
- kötegelt OpenAI embeddinggenerálás
- 1536 dimenziós embeddingek tárolása
- PostgreSQL és pgvector alapú szemantikus keresés
- HNSW vektorindex cosine distance kereséshez
- RAG-alapú chatválaszok
- magyar és angol receptforrások kezelése
- magyar és angol felhasználói kérdések kezelése
- forrásmegjelölés a válaszok mellett
- két választható system prompt:
  - szigorúan forráshű;
  - beszélgető és ajánló
- system prompt választása közvetlenül a frontend felületén
- rendszerállapot-ellenőrző API-végpont
- reszponzív chat- és dokumentumkezelő felület

---

## Technológiai környezet

### Frontend

- Next.js App Router
- React
- TypeScript
- CSS Modules

### Backend

- Next.js Route Handlers
- Node.js
- TypeScript
- `pg`, node-postgres

### Adatbázis

- PostgreSQL 17
- pgvector
- HNSW vektorindex
- Docker Compose

### AI-szolgáltatás

- OpenAI API
- Embeddingmodell: `text-embedding-3-small`
- Embeddingméret: 1536
- Chatmodell: a `OPENAI_CHAT_MODEL` környezeti változóban megadott modell

### Fejlesztői eszközök

- npm
- ESLint
- tsx
- Git
- GitHub
- Visual Studio Code, opcionális

---

## Rendszerarchitektúra

```text
Böngésző
   |
   |  fájlfeltöltés, dokumentumkezelés, chat
   v
Next.js frontend
   |
   v
Next.js Route Handlers
   |
   +--> PostgreSQL documents tábla
   |
   +--> TypeScript chunking
   |
   +--> OpenAI embedding API
   |
   +--> PostgreSQL document_chunks tábla
   |        |
   |        +--> VECTOR(1536)
   |        +--> HNSW index
   |
   +--> pgvector szemantikus keresés
   |
   +--> OpenAI Responses API
   |
   v
Forrásalapú receptasszisztensi válasz
```

### Fájlfeldolgozás

```text
.txt vagy .md fájl
        |
        v
POST /api/upload
        |
        v
documents.status = uploaded
        |
        v
POST /api/process
        |
        +--> chunking
        +--> embeddinggenerálás
        +--> pgvector mentés
        |
        v
documents.status = completed
```

### Chatfolyamat

```text
Felhasználói kérdés
        |
        v
Kérdés-embedding
        |
        v
pgvector cosine similarity keresés
        |
        v
Releváns receptchunkok
        |
        v
Kiválasztott system prompt
        |
        v
OpenAI Responses API
        |
        v
Forrásalapú válasz
```

---

## Projektstruktúra

```text
ai-recipe-assistant/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts
│   │   ├── documents/
│   │   │   ├── [id]/
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── health/
│   │   │   └── route.ts
│   │   ├── process/
│   │   │   └── route.ts
│   │   ├── search/
│   │   │   └── route.ts
│   │   └── upload/
│   │       └── route.ts
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.module.css
│   └── page.tsx
├── components/
│   ├── ChatInterface.module.css
│   ├── ChatInterface.tsx
│   ├── DocumentManager.module.css
│   ├── DocumentManager.tsx
│   ├── RecipeAssistantApp.module.css
│   └── RecipeAssistantApp.tsx
├── database/
│   └── migrations/
│       └── 001_initial_schema.sql
├── lib/
│   ├── chunking.ts
│   ├── database.ts
│   ├── openai.ts
│   ├── rag.ts
│   ├── system-prompts.ts
│   └── vector-search.ts
├── scripts/
│   ├── test-chunking.ts
│   └── test-embedding.ts
├── test-data/
├── .env.example
├── .gitignore
├── compose.yaml
├── package.json
├── package-lock.json
└── README.md
```

---

## Előfeltételek

A projekt futtatásához a következő programok szükségesek:

- Git
- Node.js, lehetőleg aktuális LTS vagy a projekttel tesztelt újabb verzió
- npm
- Docker Desktop, Docker Compose támogatással
- OpenAI API-fiók aktív API-egyenleggel

### Telepítések ellenőrzése

PowerShellben:

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

A Docker Desktopnak futnia kell az adatbázis indítása előtt.

---

## Telepítés

### 1. Repository klónozása

```powershell
git clone https://github.com/FELHASZNALONEV/ai-recipe-assistant.git
cd ai-recipe-assistant
```

Privát repository esetén GitHub-hitelesítés szükséges.

### 2. Node.js-függőségek telepítése

```powershell
npm install
```

Ha az npm egy csomag install scriptjének jóváhagyását kéri, csak az ellenőrzött és szükséges csomagot engedélyezd. A projekt fejlesztése során például az `esbuild` és az `unrs-resolver` install scriptje lehet szükséges.

A függőségek ellenőrzése:

```powershell
npm list --depth=0
```

---

## Környezeti változók

A projekt gyökerében található `.env.example` alapján hozz létre egy `.env` fájlt.

PowerShellben:

```powershell
Copy-Item .env.example .env
```

A `.env` javasolt szerkezete:

```dotenv
POSTGRES_PASSWORD=replace_with_a_strong_local_password

DATABASE_URL=postgresql://recipe_user:replace_with_a_strong_local_password@localhost:5432/recipe_assistant

OPENAI_API_KEY=replace_with_your_openai_api_key

OPENAI_EMBEDDING_MODEL=text-embedding-3-small

OPENAI_CHAT_MODEL=gpt-4o-mini

SYSTEM_PROMPT_VARIANT=strict
```

### Változók magyarázata

| Változó | Kötelező | Leírás |
|---|---:|---|
| `POSTGRES_PASSWORD` | Igen | A helyi PostgreSQL-felhasználó jelszava |
| `DATABASE_URL` | Igen | A Next.js backend PostgreSQL kapcsolati címe |
| `OPENAI_API_KEY` | Igen | Az OpenAI API titkos kulcsa |
| `OPENAI_EMBEDDING_MODEL` | Igen | A dokumentum- és kérdés-embeddinghez használt modell |
| `OPENAI_CHAT_MODEL` | Igen | A végleges RAG-válaszokat létrehozó modell |
| `SYSTEM_PROMPT_VARIANT` | Nem | Alapértelmezett prompt: `strict` vagy `conversational` |

> A `POSTGRES_PASSWORD` értékének meg kell egyeznie a `DATABASE_URL` címben szereplő jelszóval.

### Biztonsági ellenőrzés

A `.env` fájl nem kerülhet Gitbe:

```powershell
git check-ignore -v .env
```

A `git status` kimenetében a `.env` fájl nem jelenhet meg.

---

## Adatbázis indítása

### 1. Docker Compose konfiguráció ellenőrzése

```powershell
docker compose config --quiet
```

Siker esetén a parancs nem feltétlenül ír ki semmit.

### 2. PostgreSQL és pgvector indítása

```powershell
docker compose up -d
```

### 3. Állapot ellenőrzése

```powershell
docker compose ps
```

A kívánt állapot:

```text
ai-recipe-postgres    Up ... (healthy)
```

### 4. Naplók ellenőrzése

```powershell
docker compose logs database --tail 30
```

A sikeres indulás egyik fontos üzenete:

```text
database system is ready to accept connections
```

---

## Adatbázis-migráció

Új vagy üres adatbázis esetén futtasd a kezdeti migrációt:

```powershell
Get-Content -Raw database/migrations/001_initial_schema.sql | docker exec -i ai-recipe-postgres psql -v ON_ERROR_STOP=1 -U recipe_user -d recipe_assistant
```

A migráció létrehozza:

- a `vector` PostgreSQL extensiont;
- a `document_status` enum típust;
- a `documents` táblát;
- a `document_chunks` táblát;
- a dokumentum- és chunkindexeket;
- a cosine distance kereséshez használt HNSW vektorindexet.

### Migráció ellenőrzése

```powershell
docker exec -it ai-recipe-postgres psql -U recipe_user -d recipe_assistant
```

A PostgreSQL-parancssorban:

```sql
\dt
```

A következő tábláknak kell megjelenniük:

```text
documents
document_chunks
```

A pgvector ellenőrzése:

```sql
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';
```

Kilépés:

```text
\q
```

A migráció `IF NOT EXISTS` utasításokat használ, ezért ismételt futtatáskor a már létező objektumokat kihagyja.

---

## Az alkalmazás futtatása

### Fejlesztői mód

```powershell
npm run dev
```

A webalkalmazás alapértelmezett címe:

```text
http://localhost:3000
```

### Produkciós build ellenőrzése

```powershell
npm run build
```

### Produkciós indítás

```powershell
npm run start
```

A produkciós indítás előtt az `npm run build` parancsnak sikeresen le kell futnia.

### Kódminőség ellenőrzése

```powershell
npm run lint
```

---

## Használat

### Dokumentumkezelés

1. Nyisd meg az alkalmazást.
2. Válaszd a **Dokumentumkezelés** nézetet.
3. Válassz egy `.txt` vagy `.md` fájlt.
4. Kattints a **Fájl feltöltése** gombra.
5. A feltöltött dokumentum `Feltöltve` állapotban jelenik meg.
6. Kattints a **Feldolgozás** gombra.
7. Várd meg a `Feldolgozva` állapotot.
8. Ellenőrizd, hogy a chunkok és embeddingek száma megegyezik.

### Ajánlott dokumentumforma

A legjobb keresési eredményhez egy fájl egy receptet tartalmazzon.

```markdown
# Recept neve

## Kategória

Főétel

## Hozzávalók

- első hozzávaló
- második hozzávaló

## Elkészítés

1. Első lépés.
2. Második lépés.

## Allergének

A forrás szerint megadott allergéninformáció.
```

A címsorok pontos neve nem kötelező. A chunking elsősorban bekezdés- és méretalapú.

### Chat használata

1. Válaszd a **Receptasszisztens** nézetet.
2. Válaszd ki a kívánt system promptot.
3. Írd be a recepttel kapcsolatos kérdést.
4. Kattints a **Küldés** gombra, vagy nyomj Entert.
5. Shift + Enter használatával új sort hozhatsz létre.
6. A válasz alatt megjelenik:
   - a használt system prompt;
   - a felhasznált receptforrások;
   - a retrieval hasonlósági értéke százalékos formában.

### Példakérdések

```text
Melyik recept tartalmaz csirkét, gombát és rizst?
```

```text
Keress húsmentes ételt csicseriborsóval és kókusztejjel.
```

```text
Milyen halétel készül citrommal?
```

```text
Hasonlítsd össze a paradicsomos tésztát és a sütőtökös rizottót.
```

```text
Mennyi mézet kell tenni a paradicsomos tésztába?
```

Az utolsó kérdés a hallucináció elleni system prompt szabályt teszteli.

---

## System prompt változatok

Az alkalmazás két előre definiált system promptot támogat.

### Szigorúan forráshű

A `strict` változat célja:

- kizárólag forrásalapú válaszadás;
- hiányzó adatok kitalálásának megakadályozása;
- különböző receptek adatainak elkülönítése;
- allergéninformációk óvatos kezelése;
- témán kívüli kérdések korlátozása;
- egységes forrásmegjelölés.

### Beszélgető és ajánló

A `conversational` változat célja:

- természetesebb, felhasználóbarát válaszadás;
- receptajánlások rövid indoklással;
- legfeljebb három releváns recept rangsorolása;
- szükség esetén pontosító kérdés;
- az eredeti recept és a javasolt módosítás elkülönítése.

### Promptválasztás

A prompt a chatfelület fejlécében választható ki. A választott változat kérésenként kerül elküldésre a backendnek, ezért a váltáshoz nem szükséges újraindítani az alkalmazást.

Ha a frontend nem küld promptváltozatot, a rendszer a következő környezeti változót használja:

```dotenv
SYSTEM_PROMPT_VARIANT=strict
```

A promptok teljes tartalma:

```text
lib/system-prompts.ts
```

---

## API-végpontok

### `GET /api/health`

Ellenőrzi:

- a Next.js backend működését;
- a PostgreSQL-kapcsolatot;
- az adatbázis nevét;
- a PostgreSQL-verziót;
- a pgvector extension állapotát.

Példa:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get
```

### `POST /api/upload`

`.txt` vagy `.md` dokumentum feltöltése `multipart/form-data` formátumban.

PowerShell-példa:

```powershell
curl.exe -X POST -F "file=@test-data/test-recipe.txt;type=text/plain" http://localhost:3000/api/upload
```

### `POST /api/process`

Feltöltött dokumentum chunkolása, embeddinggenerálása és pgvectoros mentése.

```powershell
$requestBody = @{
    documentId = "DOCUMENT_UUID"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/process" `
    -Method Post `
    -ContentType "application/json" `
    -Body $requestBody
```

### `GET /api/documents`

A feltöltött dokumentumok, státuszok, chunkok és embeddingek számának lekérése.

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/documents" -Method Get
```

### `DELETE /api/documents/:id`

Egy dokumentum és a hozzá tartozó chunkok törlése.

```powershell
$documentId = "DOCUMENT_UUID"

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/documents/$documentId" `
    -Method Delete
```

### `POST /api/search`

Szemantikus keresés pgvector segítségével.

```powershell
$requestBody = @{
    query = "Paradicsomos tésztát keresek."
    limit = 5
    minimumSimilarity = 0.2
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/search" `
    -Method Post `
    -ContentType "application/json" `
    -Body $requestBody
```

### `POST /api/chat`

Teljes RAG-chatfolyamat retrieval és válaszgenerálás használatával.

```powershell
$requestBody = @{
    message = "Milyen vegetáriánus főételt ajánlasz?"
    limit = 5
    minimumSimilarity = 0.2
    systemPromptVariant = "strict"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/chat" `
    -Method Post `
    -ContentType "application/json" `
    -Body $requestBody
```

A `systemPromptVariant` engedélyezett értékei:

```text
strict
conversational
```

---

## RAG-feldolgozási folyamat

### Chunking

A `lib/chunking.ts` modul:

- egységesíti a sortöréseket;
- eltávolítja a sorvégi felesleges szóközöket;
- bekezdésekre bontja a dokumentumot;
- mondat- vagy szóhatároknál bontja a túl hosszú részeket;
- átfedést alkalmaz a szomszédos chunkok között;
- becsült tokenszámot számít.

Alapértelmezett beállítások:

```text
Maximális chunkméret: 1200 karakter
Átfedés: 200 karakter
Minimális chunkméret: 100 karakter
```

### Embedding

Az embeddingek generálása:

```text
text-embedding-3-small
```

Az adatbázis mezője:

```sql
VECTOR(1536)
```

A dokumentumchunkok embeddingjei lehetőség szerint egy kötegelt API-kéréssel készülnek.

### Szemantikus keresés

A keresés cosine distance alapján történik a pgvector `<=>` operátorával.

A similarity számítása:

```text
similarity = 1 - cosine distance
```

A rendszer csak:

- `completed` állapotú dokumentumokat;
- embeddinggel rendelkező chunkokat;
- a minimum similarity küszöböt elérő találatokat

adja át a válaszgenerálásnak.

### Válaszgenerálás

A `lib/rag.ts` modul:

1. összeállítja a releváns forráskontextust;
2. kiválasztja a frontend által megadott system promptot;
3. elküldi a forrásokat és a kérdést az OpenAI Responses API-nak;
4. visszaadja a választ, a modell nevét és az aktív promptváltozatot.

Ha nincs releváns retrieval találat, a rendszer nem indít fölösleges chatmodell-hívást.

---

## Tesztelés

### Chunking teszt

```powershell
npx tsx scripts/test-chunking.ts
```

A teszt ellenőrzi:

- a normalizálást;
- a chunkok számát;
- a karakterszámot;
- a becsült tokenszámot;
- a chunkpozíciókat;
- az átfedést.

### Embedding teszt

```powershell
npx tsx scripts/test-embedding.ts
```

A sikeres teszt fontos eredménye:

```text
Kapott dimenzió: 1536
```

Ez a teszt valódi OpenAI API-hívást indít, ezért kis mértékű API-költséget okozhat.

### Lint

```powershell
npm run lint
```

### Build

```powershell
npm run build
```

### System prompt A/B teszt

Ugyanazt a kérdést futtasd le mindkét prompttal:

```text
Szigorúan forráshű
Beszélgető és ajánló
```

A teszt során ne változtasd meg:

- a kérdés szövegét;
- a dokumentumállományt;
- az embeddingmodellt;
- a chatmodellt;
- a retrieval limitet;
- a similarity küszöböt.

Javasolt értékelési szempontok:

- relevancia;
- forráshűség;
- hiányzó adatok kezelése;
- forrásmegjelölés;
- nyelvhelyesség;
- válaszformátum;
- promptkövetés;
- felhasználhatóság.

### Retrieval pontosság

Javasolt metrikák:

- Hit@1
- Hit@3
- Mean Reciprocal Rank, MRR
- Precision@3

Minden tesztkérdéshez előre meg kell határozni az elvárt receptdokumentumot.

### Válaszidő

Külön mérendő:

- `/api/search`, retrieval válaszidő;
- `/api/chat`, teljes RAG válaszidő.

Javasolt query típusok:

- pontos receptnév;
- hozzávaló-alapú keresés;
- átfogalmazott szemantikus kérdés;
- többfeltételes kérdés;
- összehasonlító kérdés;
- nem releváns kérdés.

Minden queryt legalább ötször érdemes futtatni.

### Memóriahasználat

PostgreSQL-konténer:

```powershell
docker stats ai-recipe-postgres --no-stream
```

Node.js-folyamatok Windows alatt:

```powershell
Get-Process node |
    Select-Object Id, ProcessName,
        @{Name="WorkingSetMB"; Expression={[math]::Round($_.WorkingSet64 / 1MB, 2)}},
        @{Name="PrivateMemoryMB"; Expression={[math]::Round($_.PrivateMemorySize64 / 1MB, 2)}}
```

Adatbázisméret:

```sql
SELECT pg_size_pretty(
    pg_database_size('recipe_assistant')
) AS database_size;
```

HNSW index mérete:

```sql
SELECT pg_size_pretty(
    pg_relation_size(
        'document_chunks_embedding_hnsw_index'
    )
) AS vector_index_size;
```

---

## Tesztelési eredmények összefoglalása

> **Kitöltési megjegyzés:** ez a fejezet előkészített eredménytáblákat tartalmaz. A `Kitöltendő` értékeket a tényleges tesztek elvégzése után kell valós mérési eredményekre cserélni. Szintetikus vagy becsült eredményt nem szabad tényleges mérésként feltüntetni.

A rendszer értékelése funkcionális, kvalitatív és kvantitatív módszerekkel történik. A funkcionális tesztek az alkalmazás fő folyamatait ellenőrzik, a retrieval tesztek a szemantikus keresés pontosságát mérik, a teljesítménytesztek pedig a válaszidőt és az erőforrás-használatot vizsgálják.

### Tesztkörnyezet

| Jellemző | Érték |
|---|---|
| Teszt dátuma | Kitöltendő |
| Operációs rendszer | Kitöltendő |
| Node.js verzió | Kitöltendő |
| npm verzió | Kitöltendő |
| Next.js verzió | Kitöltendő |
| PostgreSQL verzió | Kitöltendő |
| pgvector verzió | Kitöltendő |
| Embeddingmodell | `text-embedding-3-small` |
| Chatmodell | Kitöltendő |
| Dokumentumok száma | Kitöltendő, célérték legalább 20–30 dokumentum |
| Chunkok száma | Kitöltendő |
| System prompt változatok | `strict`, `conversational` |

### Funkcionális tesztek eredményei

| Tesztelt funkció | Elvárt eredmény | Tényleges eredmény | Állapot |
|---|---|---|---|
| TXT-fájl feltöltése | A dokumentum `uploaded` állapotban létrejön | Kitöltendő | Kitöltendő |
| Markdown-fájl feltöltése | A dokumentum `uploaded` állapotban létrejön | Kitöltendő | Kitöltendő |
| Nem támogatott fájltípus | A rendszer elutasítja a fájlt | Kitöltendő | Kitöltendő |
| Üres fájl feltöltése | A rendszer elutasítja a fájlt | Kitöltendő | Kitöltendő |
| Duplikált dokumentum | A rendszer `409 Conflict` választ ad | Kitöltendő | Kitöltendő |
| Dokumentumfeldolgozás | Chunkok és embeddingek jönnek létre | Kitöltendő | Kitöltendő |
| Embeddingdimenzió | Minden embedding 1536 dimenziós | Kitöltendő | Kitöltendő |
| Dokumentumlista | Megjelennek a dokumentumok és státuszok | Kitöltendő | Kitöltendő |
| Dokumentumtörlés | A dokumentum és chunkjai törlődnek | Kitöltendő | Kitöltendő |
| Szemantikus keresés | Releváns recept kerül a találatok közé | Kitöltendő | Kitöltendő |
| RAG-chat | Forrásalapú válasz készül | Kitöltendő | Kitöltendő |
| Szigorú system prompt | A backend a `strict` promptot használja | Kitöltendő | Kitöltendő |
| Beszélgető system prompt | A backend a `conversational` promptot használja | Kitöltendő | Kitöltendő |
| Forrásmegjelölés | A válasz mellett helyes receptforrás jelenik meg | Kitöltendő | Kitöltendő |

Az állapot javasolt értékei:

```text
Megfelelt
Részben megfelelt
Nem felelt meg
```

### Retrieval pontossági eredmények

A szemantikus keresés pontosságát előre címkézett kérdéskészlettel kell mérni. Minden kérdéshez előre meg kell határozni az elvárt receptdokumentumot vagy dokumentumokat.

| Metrika | Eredmény | Értelmezés |
|---|---:|---|
| Tesztkérdések száma | Kitöltendő | A címkézett retrieval kérdések száma |
| Hit@1 | Kitöltendő | A helyes dokumentum az első találat |
| Hit@3 | Kitöltendő | A helyes dokumentum szerepel az első három találatban |
| MRR | Kitöltendő | A helyes találat átlagos rangsorbeli helye |
| Precision@3 | Kitöltendő | Az első három találat relevanciája |

Javasolt részletes eredménytábla:

| Query ID | Tesztkérdés | Elvárt dokumentum | Top 1 találat | Helyes rang | Megfelelt? |
|---:|---|---|---|---:|---|
| Q-01 | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| Q-02 | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| Q-03 | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |

### System prompt A/B teszt eredményei

A két promptváltozatot ugyanazzal a dokumentumállománnyal, azonos kérdésekkel, azonos modellekkel és változatlan retrieval-beállításokkal kell összehasonlítani.

| Szempont | Szigorúan forráshű | Beszélgető és ajánló | Megjegyzés |
|---|---:|---:|---|
| Relevancia | Kitöltendő | Kitöltendő | Kitöltendő |
| Forráshűség | Kitöltendő | Kitöltendő | Kitöltendő |
| Hiányzó adatok kezelése | Kitöltendő | Kitöltendő | Kitöltendő |
| Forrásmegjelölés | Kitöltendő | Kitöltendő | Kitöltendő |
| Nyelvhelyesség | Kitöltendő | Kitöltendő | Kitöltendő |
| Válaszformátum követése | Kitöltendő | Kitöltendő | Kitöltendő |
| Allergénóvatosság | Kitöltendő | Kitöltendő | Kitöltendő |
| Felhasználhatóság | Kitöltendő | Kitöltendő | Kitöltendő |
| Összesített pontszám | Kitöltendő | Kitöltendő | Kitöltendő |

A pontozás javasolt skálája:

```text
0 pont: nem megfelelő
1 pont: részben megfelelő
2 pont: megfelelő
```

### Válaszidő-mérések

A retrieval és a teljes RAG-folyamat válaszidejét külön kell mérni. Egy queryt legalább ötször érdemes lefuttatni, az első futást pedig bemelegítő mérésként külön lehet kezelni.

| Query típusa | Végpont | Ismétlések | Minimum ms | Átlag ms | Medián ms | Maximum ms | P95 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| Pontos receptnév | `/api/search` | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| Hozzávaló-alapú | `/api/search` | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| Többfeltételes | `/api/search` | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| Nem releváns | `/api/search` | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| Pontos receptnév | `/api/chat` | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| Összehasonlító | `/api/chat` | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| Nem releváns | `/api/chat` | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |

### Memória- és tárhelyhasználati eredmények

A memóriahasználatot azonos körülmények között, stabilizálódott alkalmazásállapotban kell mérni.

| Dokumentumok | Chunkok | Embeddingek | Node.js Working Set MB | PostgreSQL memória MB | Adatbázisméret | HNSW index mérete |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| 10 | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| 20 | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |
| 30 | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő | Kitöltendő |

### Összesített értékelés

A tényleges tesztek elvégzése után ebben a részben röviden össze kell foglalni:

- teljesültek-e a funkcionális követelmények;
- milyen retrieval pontosságot ért el a rendszer;
- mely system prompt adott jobb eredményt az egyes szempontok szerint;
- mely query típusok voltak gyorsabbak vagy lassabbak;
- hogyan változott a memória- és tárhelyhasználat a dokumentumszám növekedésével;
- volt-e mérhető hiba, instabilitás vagy korlátozás;
- melyik konfiguráció került kiválasztásra végleges beállításként.

**Tesztelési következtetés:** Kitöltendő a tényleges mérések elvégzése után.

---

## Biztonság

### Titkos adatok

A következő adatok kizárólag a helyi `.env` fájlban tárolhatók:

- OpenAI API-kulcs;
- PostgreSQL-jelszó;
- adatbázis-kapcsolati cím, ha hitelesítési adatot tartalmaz.

Soha ne kerüljenek:

- Git commitba;
- GitHub repositoryba;
- frontend kódba;
- `NEXT_PUBLIC_` előtagú változóba;
- képernyőképbe vagy dokumentációba.

### Fájlfeltöltés

A backend ellenőrzi:

- a fájl meglétét;
- a `.txt` vagy `.md` kiterjesztést;
- a MIME-típust;
- az 1 MB-os méretkorlátot;
- az UTF-8 kódolást;
- az üres tartalmat;
- a duplikált tartalmat.

### SQL-biztonság

Az adatbázis-lekérdezések paraméterezett SQL-t használnak.

### System prompt biztonság

A frontend nem küldhet tetszőleges system prompt szöveget. Csak két előre engedélyezett érték fogadható el:

```text
strict
conversational
```

A feltöltött dokumentumok tartalma adatként kezelendő, nem rendszerutasításként.

---

## Gyakori hibák és megoldások

### Az adatbázis nem `healthy`

```powershell
docker compose ps
docker compose logs database --tail 50
```

Ellenőrizd:

- fut-e a Docker Desktop;
- szabad-e az 5432-es port;
- létezik-e a `.env` fájl;
- be van-e állítva a `POSTGRES_PASSWORD`.

### Hibás adatbázisjelszó

A `POSTGRES_PASSWORD` és a `DATABASE_URL` jelszava legyen azonos.

Ha a PostgreSQL volume már korábbi jelszóval jött létre, az egyszerű `.env` módosítás nem változtatja meg automatikusan a meglévő adatbázis-felhasználó jelszavát.

### A pgvector nincs aktiválva

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Az OpenAI API-kulcs hiányzik

Ellenőrizd:

```dotenv
OPENAI_API_KEY=...
```

A `.env` módosítása után indítsd újra a Next.js fejlesztői szervert.

### `insufficient_quota`

Ellenőrizd az OpenAI API-egyenleget és a projekt számlázási beállításait.

### Duplikált dokumentum

Az alkalmazás tartalmi hash alapján felismeri az azonos dokumentumot. Azonos tartalom más fájlnéven sem tölthető fel újra.

### A promptválasztó mindig `strict` értéket mutat

Ellenőrizd, hogy:

- a frontend elküldi-e a `systemPromptVariant` mezőt;
- az `/api/chat` validálja és továbbadja-e az értéket;
- a `generateRagAnswer()` megkapja-e a változatot;
- a backend válasza tartalmazza-e a tényleges változatot.

A böngésző Fejlesztői eszközeinek Network lapján ellenőrizhető a kérés Payload és Response tartalma.

### `Unterminated template literal`

Ellenőrizd a backtick karaktereket a TypeScript-fájlban:

```text
`
```

A nyitó és záró backtickeknek párban kell szerepelniük.

### A PowerShellben hibás JSON érkezik

Használd a `ConvertTo-Json` és az `Invoke-RestMethod` parancsokat a kézzel írt `curl.exe` JSON helyett.

---

## Git használata

### Módosítások ellenőrzése

```powershell
git status
```

### Összes nem kizárt változás hozzáadása

```powershell
git add .
```

### Staging tartalom ellenőrzése

```powershell
git status
git diff --cached
```

### Commit

```powershell
git commit -m "Describe the implemented change"
```

### Feltöltés

```powershell
git push
```

Commit előtt mindig ellenőrizd, hogy ezek ne kerüljenek be:

```text
.env
node_modules
.next
```

---

## Korlátozások

- Csak `.txt` és `.md` fájlok támogatottak.
- A maximális fájlméret 1 MB.
- A dokumentumoknak érvényes UTF-8 szöveget kell tartalmazniuk.
- A jelenlegi felület egyenkénti fájlfeltöltést használ.
- A chatelőzmények vizuálisan megjelennek, de minden kérés önálló. A korábbi üzenetek jelenleg nem kerülnek visszaküldésre a nyelvi modellnek.
- A chunking általános bekezdés- és méretalapú, nem igényel rögzített receptcímsorokat.
- Egy fájlban lehetőség szerint egy recept szerepeljen.
- A RAG-válasz minősége függ a feltöltött dokumentumok minőségétől, a chunkingtól, a similarity küszöbtől és a kiválasztott modelltől.
- Az OpenAI API használata fogyasztásalapú költséggel járhat.
- Az alkalmazás nem adhat egészségügyi vagy allergológiai garanciát.

---

## Tanulságok

A projekt megvalósítása során a következő főbb tapasztalatok és tanulságok fogalmazódtak meg:

- A RAG-rendszer végső válaszminőségét nagymértékben meghatározza a retrieval minősége. Ha a keresés nem a megfelelő dokumentumot vagy chunkot adja vissza, a nyelvi modell sem tud megbízható, forráshű választ készíteni.

- A retrieval és a válaszgenerálás külön tesztelése segít meghatározni, hogy egy hibás válasz a keresésből, a chunkingból, a system promptból vagy a nyelvi modell válaszgenerálásából ered-e.

- A dokumentumok megfelelő chunkolása alapvető fontosságú. A túl nagy chunkok több, egymástól független információt keverhetnek össze, míg a túl rövid chunkok elveszíthetik a szükséges szövegkörnyezetet.

- A chunkok közötti átfedés segít megőrizni a bekezdések és mondatok közötti kapcsolatot, ugyanakkor növeli az eltárolt szövegmennyiséget, az embeddingek számát és az API-költséget.

- Egy recept dokumentumonként történő tárolása pontosabb forrásmegjelölést, egyszerűbb dokumentumkezelést és jobb szemantikus elkülönítést eredményez.

- A dokumentumok és a felhasználói kérdések embeddingjeit ugyanazzal az embeddingmodellel és azonos dimenzióval kell létrehozni.

- A többnyelvű embeddingmodell lehetővé teszi, hogy az angol nyelvű receptdokumentumok magyar nyelvű kérdésekkel is visszakereshetők legyenek.

- A részletes, strukturált system prompt csökkenti a nem alátámasztott állítások és a hallucinációk előfordulását, valamint egységesebb válaszformátumot eredményez.

- A szigorúan forráshű system prompt várhatóan pontosabb és könnyebben ellenőrizhető válaszokat eredményez, míg a beszélgető és ajánló prompt természetesebb felhasználói élményt és részletesebb ajánlásokat adhat. A tényleges különbséget kontrollált A/B tesztekkel kell igazolni.

- A frontendről választható system prompt megkönnyíti az azonos kérdésekkel végzett A/B tesztelést, mert a két változat közötti váltás nem igényel kódmódosítást vagy szerver-újraindítást.

- A feltöltött dokumentumokat nem megbízható adatforrásként kell kezelni. A dokumentumokban szereplő utasítások nem írhatják felül a rendszerutasításokat.

- A környezeti változók és az API-kulcsok elkülönített kezelése alapvető biztonsági követelmény. A titkos adatok nem kerülhetnek a Git repositoryba vagy a frontend kódjába.

- A PostgreSQL és pgvector használata lehetővé tette, hogy a dokumentumok, metaadatok, chunkok és vektorok egyetlen adatbázisban legyenek kezelhetők.

- A Jupyter Notebook megfelelő eszköz kísérletezéshez, de a végleges webalkalmazásban a moduláris TypeScript-kód egyszerűbb, átláthatóbb és reprodukálhatóbb futtatást biztosít.

- Az API-költség csökkentésében fontos szerepe van a duplikált dokumentumok felismerésének, a kötegelt embeddinggenerálásnak és annak, hogy releváns találat hiányában a rendszer nem indít fölösleges chatmodell-hívást.

- A teljesítménymérések során a retrieval végpont és a teljes RAG-chat válaszidejét külön kell kezelni, mert az OpenAI válaszgenerálás hálózati és modelloldali késleltetése jelentősen eltérhet a helyi pgvector keresés idejétől.

---

## Továbbfejlesztési lehetőségek

- több fájl egyidejű feltöltése;
- tömeges TypeScript receptimport;
- receptcím automatikus kiolvasása az első Markdown-címsorból;
- receptspecifikus chunking;
- kategória- és allergénszűrők;
- chatelőzmények szerveroldali kezelése;
- felhasználói hitelesítés;
- jogosultságkezelés;
- automatikus API- és integrációs tesztek;
- válaszidő- és memória-benchmark szkriptek;
- prompt A/B teszteredmények mentése;
- streaming chatválaszok;
- Docker image a Next.js alkalmazáshoz;
- teljes produkciós deployment folyamat.

---

## Szerző

**Microsoft 365 Copilot,  Köbli Gábor instrukciói alapján**

AI Engineering képzés, webalkalmazás házi feladat.

---

## Licenc

A projekt oktatási célból készült. Külső felhasználás előtt ellenőrizni kell a felhasznált forrásadatok, npm-csomagok és AI-szolgáltatások licenc- és felhasználási feltételeit.
