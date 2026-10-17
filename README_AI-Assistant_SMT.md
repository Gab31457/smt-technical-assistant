# SMT Műszaki Asszisztens

## Cél

Az alkalmazás feltöltött SMT-, ESD-, gyártási és berendezésdokumentumokból keres releváns részleteket, majd ellenőrizhető, forrásalapú választ készít. A cél a műszaki információk gyors visszakeresése, nem az eredeti, jóváhagyott dokumentáció kiváltása.

## Technológia

- Next.js App Router, React, TypeScript és CSS Modules
- Next.js Route Handlers és Node.js
- PostgreSQL, pgvector és vektorindex
- OpenAI embedding- és chatmodellek
- Docker Compose

## Dokumentumkezelés

Támogatott formátumok:

- TXT és Markdown
- PDF
- DOCX
- XLSX

A feldolgozás típustól függő metaadatokat őriz meg:

- PDF: oldalszám
- XLSX: munkalap, kezdő és záró sor
- DOCX: bekezdések és táblázatos tartalom

A dokumentumok feldolgozás után chunkokra bomlanak, embeddinget kapnak, majd PostgreSQL-ben tárolódnak.

## RAG-folyamat

```text
Feltöltés → szövegkinyerés → chunkolás → embedding → pgvector
→ többnyelvű keresés → releváns kontextus → modellválasz → forráslista
```

## Többnyelvű keresés

A rendszer az aktuális kérdésből jellemzően három lekérdezést használ:

1. eredeti kérdés;
2. tömör magyar műszaki keresőkérdés;
3. tömör angol műszaki keresőkérdés.

A generált lekérdezések strukturált JSON-kimenetet használnak:

```json
{
  "hungarianQuery": "csuklópánt személyi földelés ellenállás",
  "englishQuery": "wrist strap personnel grounding resistance",
  "usesPreviousContext": false
}
```

A rendszer megőrzi a számokat, mértékegységeket, géptípusokat, hibakódokat és rövidítéseket. Pneumatikus kérdéseknél olyan szinonimákat is használ, mint `compressed air supply`, `flow rate`, `air consumption` és `tube diameter`.

## Kontextuskezelés

Az aktuális kérdés az elsődleges. A korábbi beszélgetés csak valódi visszautalásnál egészíti ki a keresést. Ez segít elkülöníteni az új témát az olyan rövid kérdésektől, mint:

```text
And what is the maximum permitted pressure?
```

## Tudásforrásmódok

- **Dokumentumok:** kizárólag a visszakeresett források alapján válaszol.
- **Modell:** nem használ feltöltött dokumentumot.
- **Hibrid:** dokumentumok és általános modelltudás együtt, elkülönített állításokkal.

## Dokumentumszűrés

A keresés futtatható:

- minden feldolgozott dokumentumon;
- csak a kijelölt dokumentumokon.

A szűrés a backend szemantikus keresésében is érvényesül. Egyetlen kijelölt dokumentumnál a teljes találati keretet kitölthetik annak releváns chunkjai.

## Válaszadási módok

- szigorúan forráshű;
- beszélgető;
- alapértelmezett modellviselkedés.

A szigorú mód nem találhat ki hiányzó műszaki értéket. Forráshiány esetén ezt egyértelműen jelzi.

## Forráslista

A forrásmegjelenítés tartalmazhatja:

- dokumentumcímet vagy fájlnevet;
- PDF-oldalszámot;
- XLSX-munkalapot és sortartományt;
- felhasznált részletek számát;
- legjobb hasonlósági értéket.

Az azonos dokumentumból és forráshelyről származó chunkok a felületen összevonódnak.

## Chatkezelés

A rendszer támogatja az új beszélgetést, a chatelőzmények mentését, visszatöltését és törlését. A backend strukturált `user` és `assistant` üzenetlistát kap.

## Fő API-végpontok

```text
GET    /api/health
POST   /api/upload
POST   /api/process
GET    /api/documents
DELETE /api/documents/:id
POST   /api/search
POST   /api/chat
GET    /api/chat-sessions
GET    /api/chat-sessions/:id
DELETE /api/chat-sessions/:id
```

Példa chatkérés:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Milyen ellenállási tartomány szükséges a csuklópánthoz?"
    }
  ],
  "systemPromptVariant": "strict",
  "knowledgeSourceMode": "documents",
  "selectedDocumentIds": ["DOCUMENT_UUID"]
}
```

## Diagnosztika

```env
RAG_RETRIEVAL_DEBUG=true
```

A terminálnapló megmutatja a generált lekérdezéseket, lekérdezésenkénti találatokat és a végleges kontextust. Normál használatnál legyen `false`.

## Ellenőrzött funkciók

- magyar kérdésből angol PDF-részlet megtalálása
- kiválasztott dokumentumra korlátozott keresés
- negatív dokumentumszűrés
- PDF-oldalszám és XLSX-forráshely megőrzése
- új téma és visszautaló kérdés elkülönítése
- pneumatikus műszaki szinonimák használata
- GrifEye V2 adatainak visszakeresése egy kijelölt dokumentumból

## Ismert korlátok

- A válasz minősége függ a szövegkinyeréstől, chunkolástól és rangsorolástól.
- Több dokumentum, témaváltás és nyelvváltás egyidejű Multi-turn tesztje kevésbé stabil.
- A hasonlósági százalék nem bizonyítja, hogy a chunk tartalmazza a keresett konkrét értéket.
- Az LLM-alapú komponensek nem teljesen determinisztikusak.
- Kritikus műszaki döntés előtt az eredeti jóváhagyott dokumentáció az irányadó.

## Futtatás és ellenőrzés

```powershell
npm install
docker compose up -d
npm run lint
npm run build
npm run dev
```

## Szerző

**KG, Microsoft 365 Copilot támogatásával**
