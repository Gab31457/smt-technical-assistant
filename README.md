# SMT műszaki asszisztens

A projekt egy saját dokumentumokra épülő, többnyelvű SMT műszaki asszisztens. A rendszer feltöltött műszaki dokumentumokból nyer ki szöveget, a tartalmat részekre bontja, embeddingeket készít, majd PostgreSQL és pgvector segítségével szemantikus keresést végez.

Az asszisztens magyar és angol kérdéseket is kezel, streamelt választ ad, megjeleníti a felhasznált forrásokat, és külön Evaluation felületet biztosít a RAG-, prompt-, alkalmazás- és többfordulós tesztekhez.

## Fő funkciók

- TXT-, Markdown-, PDF-, DOCX- és XLSX-dokumentumok feltöltése
- automatikus szövegkinyerés, chunkolás és embeddingkészítés
- PostgreSQL- és pgvector-alapú szemantikus keresés
- magyar és angol keresőkérdések létrehozása
- többnyelvű dokumentumkeresés
- dokumentumszintű keresési szűrés
- streamelt modellválasz
- válaszforrások és hasonlósági értékek megjelenítése
- PDF-oldalszámok megjelenítése
- XLSX-munkalapok és sortartományok megjelenítése
- tartós, PostgreSQL-alapú chatmemória
- beszélgetések létrehozása, visszatöltése és törlése
- három válaszadási mód
- három tudásforrás-mód
- tokenhasználat, válaszidő és becsült API-költség mérése
- helyi OpenTelemetry-instrumentáció
- saját Evaluation rendszer
- batch tesztfuttatás és JSON-eredménymentés

## Támogatott dokumentumformátumok

- `.txt`
- `.md`
- `.pdf`, ha a dokumentum meglévő szövegréteget tartalmaz
- `.docx`
- `.xlsx`

> OCR nincs beépítve, ezért a kizárólag képként tárolt vagy szkennelt PDF-fájlok szövege nem dolgozható fel automatikusan.

## Technológiai alapok

- Next.js 16
- React
- TypeScript
- Node.js
- PostgreSQL
- pgvector
- Docker és Docker Compose
- OpenAI API
- OpenTelemetry

## Előfeltételek

A projekt futtatásához szükséges:

- Node.js 20 vagy újabb
- npm
- Docker Desktop
- Docker Compose
- Git
- OpenAI API-kulcs
- modern webböngésző

## Telepítés

### 1. Repository letöltése

Klónozd a projektet, majd lépj be a projekt mappájába:

```powershell
git clone SAJAT_REPOSITORY_URL
cd smt-technical-assistant
```

Ha a projekt már a számítógépen található, csak nyisd meg a projekt gyökérkönyvtárát a VS Code-ban.

### 2. npm-függőségek telepítése

```powershell
npm install
```

A pontos csomagokat és verziókat a következő fájlok tartalmazzák:

```text
package.json
package-lock.json
```

### 3. Környezeti változók beállítása

A projekt gyökérkönyvtárában hozz létre egy `.env` fájlt.

Példa:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DATABASE_NAME
POSTGRES_PASSWORD=SAJAT_ADATBAZIS_JELSZO

OPENAI_API_KEY=SAJAT_OPENAI_API_KULCS
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

OPENAI_INPUT_COST_PER_1M_TOKENS=0.15
OPENAI_OUTPUT_COST_PER_1M_TOKENS=0.60

RAG_RETRIEVAL_DEBUG=false
```

A `DATABASE_URL` értékeit igazítsd a projekt Docker- és PostgreSQL-beállításaihoz.

Biztonsági szabályok:

- a valódi `.env` fájlt ne töltsd fel GitHubra;
- az OpenAI API-kulcsot ne oszd meg;
- az adatbázisjelszót ne írd dokumentációba;
- a titkos környezeti változók neve ne kezdődjön `NEXT_PUBLIC_` előtaggal.

### 4. PostgreSQL és pgvector elindítása

A projekt gyökérkönyvtárában futtasd:

```powershell
docker compose up -d
```

Ellenőrzés:

```powershell
docker compose ps
```

Az adatbázis-konténer állapota legyen futó, illetve ha van healthcheck, akkor `healthy`.

### 5. Projektellenőrzés

Futtasd a lintellenőrzést:

```powershell
npm run lint
```

Majd készíts production buildet:

```powershell
npm run build
```

Mindkét parancsnak hiba nélkül kell lefutnia.

### 6. Fejlesztői szerver elindítása

```powershell
npm run dev
```

Az alkalmazás alapértelmezett címe:

```text
http://localhost:3000
```

Az Evaluation felület címe:

```text
http://localhost:3000/evaluation
```

## Az alkalmazás használata

## 1. Dokumentum feltöltése

1. Nyisd meg az alkalmazást.
2. Válaszd a dokumentumfeltöltési lehetőséget.
3. Válassz ki egy támogatott formátumú fájlt.
4. Indítsd el a feltöltést.
5. Várd meg, amíg a dokumentum feldolgozása befejeződik.

A feldolgozási folyamat:

```text
fájlfeltöltés
→ szövegkinyerés
→ chunkolás
→ embeddingkészítés
→ PostgreSQL- és pgvector-mentés
```

A dokumentum akkor használható kereséshez, ha a feldolgozási állapota `completed`.

## 2. Új beszélgetés létrehozása

1. Kattints az **Új beszélgetés** gombra.
2. Válaszd ki a válaszadási módot.
3. Válaszd ki a tudásforrás-módot.
4. Állítsd be a keresési tartományt.
5. Írd be a kérdést.

A beszélgetések és az üzenetek a PostgreSQL-adatbázisban maradnak, ezért a böngésző vagy a fejlesztői szerver újraindítása után is visszatölthetők.

## 3. Válaszadási módok

### Szigorúan forráshű

A rendszer a lehető legszigorúbban követi a rendelkezésre álló forrásokat. Ha a szükséges információ nem található meg, ezt egyértelműen jelzi.

### Beszélgető és segítő

A válasz közérthetőbb és segítőbb stílusú, miközben továbbra is figyelembe veszi a kijelölt tudásforrást.

### Alapértelmezett modellviselkedés

A modell nem kapja meg a két egyedi SMT válaszadási rendszerprompt egyikét sem. A kiválasztott tudásforrás szabályai azonban továbbra is érvényesek.

## 4. Tudásforrás-módok

### Csak feltöltött dokumentumok

A rendszer kizárólag a feltöltött dokumentumok alapján válaszol.

### Csak a modell általános tudása

Nem történik dokumentumkeresés. A válasz az OpenAI modell általános tudásából készül.

### Dokumentumok és modell tudása

A rendszer a dokumentumok tartalmát és a modell általános tudását együtt használhatja. A két információforrást a válaszban elkülöníti.

## 5. Keresési tartomány

### Összes feltöltött dokumentum

A keresés minden sikeresen feldolgozott dokumentumban megtörténik.

### Kiválasztott dokumentumok

A keresés csak a felhasználó által kijelölt dokumentumokban történik. A kontrollált tesztekhez ez a beállítás ajánlott.

## 6. Többnyelvű használat

A rendszer támogatja többek között:

- magyar kérdés és angol dokumentum;
- angol kérdés és magyar dokumentum;
- magyar kérdés és magyar dokumentum;
- angol kérdés és angol dokumentum.

Dokumentumalapú keresésnél a rendszer magyar és angol műszaki keresőkérdést készít, majd összevonja a találatokat.

## 7. Források értelmezése

A válasz alatt megjelenhet:

- dokumentumnév;
- chunk index;
- hasonlósági érték;
- PDF-oldalszám;
- XLSX-munkalap;
- XLSX-sor vagy sortartomány.

A hasonlósági érték azt mutatja meg, hogy az adott dokumentumrész szemantikailag mennyire illeszkedik a keresőkérdéshez.

## Monitoringadatok

A rendszer a válaszokhoz technikai mérési adatokat is gyűjthet:

- első token ideje;
- teljes válaszidő;
- keresőkérdés-generálás ideje;
- vektorkeresés ideje;
- kontextusépítés ideje;
- válaszgenerálás ideje;
- inputtokenek száma;
- outputtokenek száma;
- összes token száma;
- becsült API-költség;
- visszakeresett chunkok száma.

Az OpenTelemetry helyben és külön fizetős monitoring backend nélkül használható.

## RAG-diagnosztika

A részletes retrieval diagnosztika a `.env` fájlban kapcsolható be:

```env
RAG_RETRIEVAL_DEBUG=true
```

Normál használathoz:

```env
RAG_RETRIEVAL_DEBUG=false
```

A `.env` módosítása után indítsd újra a fejlesztői szervert.

Bekapcsolt diagnosztikánál a terminálban megjelenhetnek:

- a létrehozott magyar és angol keresőkérdések;
- a keresőkérdésenkénti találatok;
- a chunk indexek;
- a hasonlósági értékek;
- a végső találatok.

## Evaluation rendszer használata

Nyisd meg:

```text
http://localhost:3000/evaluation
```

Az Evaluation rendszer támogatja:

- Single-turn evaluáció;
- Multi-turn evaluáció;
- prompt A/B összehasonlítás;
- RAG-szintű evaluáció;
- LLM-as-Judge értékelés;
- User Simulator használata;
- emberi felülvizsgálat;
- baseline és iteráció összehasonlítása;
- batch tesztfuttatás;
- JSON-eredménymentés.

## Batch tesztek

A tesztadatok helye:

```text
data/evaluation-test-cases
```

A fő tesztfájlok:

```text
rag-test-cases.json
prompt-test-cases.json
application-test-cases.json
single-turn-test-cases.json
multi-turn-test-cases.json
retrieval-regression-test-cases.json
```

A futási eredmények helye:

```text
data/evaluation-results
```

A batch futások JSON-fájlokat hoznak létre, például:

```text
rag-batch_*.json
prompt-batch_*.json
application-batch_*.json
```

## RAG-metrikák

A RAG-evaluáció az alábbi mutatókat kezeli:

- Precision@K;
- Recall@K;
- Mean Reciprocal Rank, röviden MRR;
- első releváns találat helyezése;
- retrieval idő;
- minimum hasonlóság;
- Top 3, Top 5 vagy Top 10 találat.

## Adatok megőrzése és törlése

A rendszer tartósan tárolja:

- a dokumentumok metaadatait;
- a dokumentumchunkokat;
- az embeddingeket;
- a beszélgetéseket;
- a chatüzeneteket.

Dokumentumtörléskor a hozzá tartozó chunkok és embeddingek az adatbázis `ON DELETE CASCADE` kapcsolata miatt automatikusan törlődnek.

Beszélgetéstörléskor a hozzá tartozó üzenetek szintén automatikusan törlődnek.

## Hasznos parancsok

Fejlesztői szerver indítása:

```powershell
npm run dev
```

Lintellenőrzés:

```powershell
npm run lint
```

Production build:

```powershell
npm run build
```

Docker-konténerek indítása:

```powershell
docker compose up -d
```

Docker-konténerek ellenőrzése:

```powershell
docker compose ps
```

Docker-konténerek leállítása:

```powershell
docker compose down
```

Git állapotának ellenőrzése:

```powershell
git status
```

## Hibaelhárítás

### Az adatbázis nem érhető el

Ellenőrizd a konténereket:

```powershell
docker compose ps
```

Ellenőrizd a `.env` fájl `DATABASE_URL` és `POSTGRES_PASSWORD` értékét.

### Az OpenAI API-hívás hibát ad

Ellenőrizd:

- az `OPENAI_API_KEY` értékét;
- az API-egyenleget vagy számlázási beállítást;
- az `OPENAI_CHAT_MODEL` értékét;
- az `OPENAI_EMBEDDING_MODEL` értékét;
- az internetkapcsolatot.

### A dokumentum feldolgozása sikertelen

Ellenőrizd:

- támogatott-e a fájlformátum;
- a PDF tartalmaz-e valódi szövegréteget;
- nem sérült-e a fájl;
- elindult-e az adatbázis;
- van-e érvényes OpenAI API-hozzáférés az embeddingkészítéshez.

### A keresés nem talál megfelelő dokumentumrészt

Próbáld meg:

- csak a releváns dokumentumot kijelölni;
- egyértelműbb műszaki kérdést megadni;
- bekapcsolni a `RAG_RETRIEVAL_DEBUG` beállítást;
- ellenőrizni a létrehozott magyar és angol keresőkérdéseket;
- ellenőrizni, hogy a dokumentum feldolgozási állapota `completed`.

### A `.env` módosítása nem érvényesül

Állítsd le a szervert:

```text
Ctrl + C
```

Majd indítsd újra:

```powershell
npm run dev
```

## Projektkorlátozások

- OCR nincs beépítve.
- A szkennelt, szövegréteg nélküli PDF-fájlok nem támogatottak.
- Fizetős monitoring backend nem szükséges.
- Az összes dokumentumban egyszerre történő keresés zajosabb lehet.
- A kontrollált tesztekhez előre meghatározott releváns dokumentumok használata ajánlott.
- A rendszer nem helyettesíti a gyártói dokumentációt vagy a szakképzett műszaki döntéshozót.

## Fejlesztési ellenőrzés

Minden jelentős módosítás után futtasd:

```powershell
npm run lint
npm run build
```

A módosítás csak akkor tekinthető befejezettnek, ha mindkét ellenőrzés hiba nélkül lefut.
