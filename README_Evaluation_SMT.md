# SMT Evaluációs Központ

## Cél

Az Evaluációs Központ az SMT Műszaki Asszisztens tesztelésére, automatikus értékelésére, emberi felülvizsgálatára és iteratív fejlesztésére szolgál. Ugyanazt a `/api/chat` folyamatot használja, mint a normál asszisztens.

## Tesztmódok

- Single-turn
- rendszerprompt A/B
- adaptív Multi-turn
- RAG-szintű evaluáció
- LLM-as-Judge
- emberi felülvizsgálat
- baseline és iteráció összehasonlítása

## Tudásforrás és dokumentumkör

A teszt futtatható dokumentum-, modell- vagy hibrid módban. Dokumentumhasználatnál a keresés vonatkozhat az összes feldolgozott fájlra vagy csak a kijelölt dokumentumokra.

A mentett JSON tartalmazza:

```json
{
  "documentSearchScope": "selected",
  "selectedDocumentIds": ["DOCUMENT_UUID"],
  "selectedDocuments": [
    {
      "id": "DOCUMENT_UUID",
      "title": "Dokumentum címe",
      "originalFilename": "dokumentum.pdf"
    }
  ]
}
```

## Single-turn

Egy kérdést futtat, és menti a választ, modellt, válaszidőt, találatokat, forrásokat, Judge-pontokat és nem alátámasztott állításokat.

Példa:

```text
Milyen ellenállási tartomány szükséges a csuklópánt személyi földelőrendszeréhez?
```

## A/B teszt

Ugyanazt a kérdést két promptváltozattal futtatja. A kérdés, dokumentumkör, modell és retrieval-beállítás legyen azonos.

## Adaptív Multi-turn

A kezdő kérdést a tesztelő adja meg. A további felhasználói üzeneteket a User Simulator készíti az asszisztens előző válasza alapján.

### Mezők

- **Felhasználói persona:** szerep, szakmai háttér, nyelv és viselkedés.
- **Felhasználó célja:** a beszélgetés során megszerzendő információk.
- **Rejtett feltételek:** később közlendő részletek, témaváltások és nyelvváltások.
- **Kezdő üzenet:** az első kézzel megadott kérdés.
- **Maximális fordulók:** egy forduló egy kérdésből és válaszból áll.
- **Elvárt viselkedés:** a Judge által ellenőrizendő eredmény.

A webes felületen mindegyik mező alatt rövid súgószöveg látható.

## User Simulator

```text
POST /api/evaluation/simulate-user
```

Példa eredmény:

```json
{
  "message": "A következő felhasználói kérdés.",
  "shouldStop": false,
  "reason": "A folytatás indoka.",
  "language": "en",
  "goalStep": 2,
  "languageValidated": true,
  "languageWasRegenerated": false
}
```

A simulator ellenőrzi az előírt nyelvet, és hibás vagy kevert nyelv esetén egyszer újragenerálhatja az üzenetet.

## RAG-evaluáció

A rendszer szabályalapon ellenőrzi:

- történt-e találat;
- kapott-e kontextust a modell;
- megtalálható-e az elvárt dokumentum;
- eléri-e a találat a minimum hasonlóságot.

## LLM-as-Judge

Pontozott szempontok:

- relevancia
- utasításkövetés
- groundedness
- érthetőség
- kontextusmegtartás
- következetesség

A Judge megkapja a tényleges forráschunkokat, valamint PDF esetén az oldalszámot, XLSX esetén a munkalapot és sortartományt.

Általános megfelelési feltételek:

```text
overallScore >= 3.5
groundedness >= 3
instructionFollowing >= 3
```

## Emberi felülvizsgálat

Megadható:

- 1-5 pont;
- megfelelt vagy nem felelt meg;
- egyetértés a Judge eredményével;
- szakmai megjegyzés.

Az emberi értékelés külön JSON-fájlba kerül.

## Eredmények

```text
data/evaluation-results/
```

Fájltípusok:

```text
single-turn_*.json
ab-test_*.json
multi-turn_*.json
rag_*.json
human-review_*.json
```

## Baseline összehasonlítás

A Results Comparison két mentett futás összpontszámát, részpontszámait, válaszidejét és megfelelési állapotát hasonlítja össze.

## Ellenőrzött eredmények

- A kiválasztott dokumentumokra korlátozott Single-turn keresés működik.
- A negatív dokumentumszűrés kizárja a nem kijelölt forrást.
- A NASA PDF-ből sikeresen visszakereshető a `800 kΩ - 1,2 MΩ` érték.
- Egyetlen kijelölt GrifEye V2 dokumentumból visszakereshetők a pneumatikus adatok.
- A mentett JSON tartalmazza a keresési tartományt és dokumentumazonosítókat.

## Ismert korlátok

- A User Simulator és a Judge nem teljesen determinisztikus.
- Több dokumentumos, nyelvváltásos, témaváltásos Multi-turn teszt instabilabb lehet.
- A Judge egyes futásokban túl magas pontszámot adhat, ezért emberi felülvizsgálat javasolt.
- Az aktuális témához kevésbé releváns, de kijelölt dokumentum chunkjai bekerülhetnek a kontextusba.
- A helyi JSON-mentés fejlesztői környezethez készült.

## Ajánlott használat

1. Először egy dokumentummal ellenőrizd a retrievalt.
2. Ezután bővítsd a dokumentumkört.
3. Mindig ellenőrizd a forrást és a forráshelyet.
4. A Judge eredményét egészítsd ki emberi felülvizsgálattal.
5. Multi-turn tesztet több alkalommal futtass.

## Technikai ellenőrzés

```powershell
npm run lint
npm run build
npm run dev
```
