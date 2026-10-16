# Evaluációs Központ

## 1. A dokumentum célja

Ez a dokumentum a meglévő AI Receptasszisztenshez készített Evaluációs Központ aktuális használatát és működését mutatja be.

Az Evaluációs Központ nem külön asszisztens, hanem a már elkészült receptasszisztens tesztelésére, automatikus értékelésére, emberi felülvizsgálatára és iteratív fejlesztésére szolgáló felület.

Kapcsolódó dokumentumok:

```text
README.md
README_AI-Assystant.md
reflection.md
```

## 2. Indítás

A projekt gyökérkönyvtárában:

```powershell
npm install
npm run dev
```

Elérési címek:

```text
AI Receptasszisztens: http://localhost:3000
Evaluációs Központ:   http://localhost:3000/evaluation
```

A felületeket és az API-végpontokat nem kell külön elindítani. Az `npm run dev` az egész Next.js alkalmazást elindítja.

## 3. Az Evaluációs Központ célja

A felület az alábbiakat támogatja:

- Single-turn evaluáció;
- rendszerprompt A/B teszt;
- adaptív Multi-turn evaluáció;
- RAG-szintű evaluáció;
- LLM as Judge automatikus értékelés;
- tényleges forrásrészletek alapján végzett groundedness-ellenőrzés;
- emberi értékelés;
- automatikus JSON-eredménymentés;
- baseline és iteráció összehasonlítása.

A projekt nem használ Braintrust vagy más külső evaluációs platformot.

## 4. Főbb fájlok

```text
app/
├── evaluation/
│   └── page.tsx
└── api/
    ├── chat/
    │   └── route.ts
    └── evaluation/
        ├── judge/
        │   └── route.ts
        ├── simulate-user/
        │   └── route.ts
        ├── save/
        │   └── route.ts
        ├── human-review/
        │   └── route.ts
        └── results/
            └── route.ts

components/
├── ChatInterface.tsx
└── evaluation/
    ├── EvaluationDashboard.tsx
    ├── HumanReviewForm.tsx
    └── ResultsComparison.tsx

lib/
├── chat-types.ts
├── rag.ts
└── evaluation/
    └── rag-evaluation.ts

data/
└── evaluation-results/
```

## 5. Strukturált beszélgetési előzmény

A normál chat és a Multi-turn evaluáció már nem csak a legutolsó felhasználói üzenetet küldi el az `/api/chat` végpontnak. A frontend minden kérésnél strukturált üzenetlistát küld:

```json
[
  {
    "role": "user",
    "content": "Ajánlj egy egyszerű vacsorát!"
  },
  {
    "role": "assistant",
    "content": "Az első asszisztensválasz..."
  },
  {
    "role": "user",
    "content": "Húst nem fogyasztok."
  }
]
```

A backend a teljes beszélgetést továbbadja a modellnek. A RAG-keresési lekérdezés a legutóbbi legfeljebb négy felhasználói üzenetből készül. Az asszisztens korábbi válaszai nem kerülnek bele a vektorkeresési lekérdezésbe, de a válaszgeneráló modell látja azokat.

Ez lehetővé teszi a természetes visszautalások értelmezését, például:

```text
És hogyan kell elkészíteni?
Az előző recept tartalmaz tejterméket?
```

## 6. Single-turn evaluáció

A Single-turn teszt egyetlen kérdést küld az asszisztensnek.

Mért és mentett adatok:

- asszisztensválasz;
- használt modell;
- rendszerprompt-változat;
- válaszidő;
- találatok és kontextusok száma;
- RAG-források;
- Judge részpontszámok;
- összpontszám és megfelelési állapot;
- a forrásokkal nem alátámasztott állítások.

Példa:

```text
Kérdés:
Milyen hozzávalók szükségesek a túrós palacsintához?

Elvárt viselkedés:
Az asszisztens kizárólag a visszakeresett receptforrás alapján sorolja fel a hozzávalókat, és ne találjon ki hiányzó adatot.
```

## 7. Prompt A/B teszt

Az A/B teszt ugyanazt a kérdést futtatja két rendszerprompttal:

```text
A változat: strict, szigorúan forráshű
B változat: conversational, beszélgető és ajánló
```

Mindkét válasz külön Judge-értékelést kap. A felület összehasonlítja:

- a válaszokat;
- a részpontszámokat;
- az összpontszámokat;
- a válaszidőket;
- a RAG-forrásokat;
- a nem alátámasztott állításokat.

## 8. Adaptív Multi-turn evaluáció

A Multi-turn teszt nem három előre rögzített felhasználói mondatot használ. A beszélgetést egy külön User Simulator alakítja az asszisztens válaszai alapján.

### Beállítható adatok

- felhasználói persona;
- felhasználói cél;
- rejtett feltételek;
- kezdő felhasználói üzenet;
- maximális fordulószám;
- rendszerprompt;
- elvárt viselkedés.

### Példa konfiguráció

```text
Persona:
Olyan felhasználó, aki egyszerű vacsorát keres, de fokozatosan mondja el az étkezési korlátozásait.

Cél:
Találjon megfelelő, egyszerű vacsorareceptet a receptadatbázisból.

Rejtett feltételek:
A recept legyen húsmentes és tejtermékmentes.

Kezdő üzenet:
Ajánlj egy egyszerű vacsorát!

Maximális fordulók:
3
```

### Működés

```text
Kezdő user üzenet
        ↓
Asszisztensválasz
        ↓
User Simulator elolvassa a választ
        ↓
A szimulátor reagáló user üzenetet generál
        ↓
A teljes beszélgetési előzmény újra eljut az asszisztenshez
```

A User Simulator:

- mindig az asszisztens legutóbbi válaszára reagál;
- a rejtett feltételeket fokozatosan közli;
- nem másolja be mesterségesen a teljes korábbi feltétellistát;
- nem használ „Vedd figyelembe az összes korábbi feltételt” típusú segítséget;
- felismerheti a megfelelő, biztonságos forráshiány-jelzést;
- nem kényszeríti az asszisztenst forrás nélküli recept kitalálására;
- a maximális fordulószámnál mindenképpen leáll.

A mentett Multi-turn eredmény tartalmazza:

- a personát, célt és rejtett feltételeket;
- a kezdő üzenetet;
- a teljes `messages` listát;
- az olvasható beszélgetési fordulókat;
- a User Simulator modelljét;
- a leállás okát;
- a teljes válaszidőt;
- a végső Judge-értékelést.

## 9. User Simulator API

A végpont:

```text
POST /api/evaluation/simulate-user
```

A bemenet tartalmazza:

- a personát;
- a felhasználói célt;
- a rejtett feltételeket;
- a teljes beszélgetést;
- az aktuális fordulószámot;
- a maximális fordulószámot.

A válasz például:

```json
{
  "message": "Ez sajnos nem megfelelő, mert tejterméket sem fogyaszthatok.",
  "shouldStop": false,
  "reason": "Az ajánlott recept megsérti a rejtett feltételt."
}
```

## 10. RAG-szintű evaluáció

A RAG-teszt külön vizsgálja a dokumentum-visszakeresést és a végső válasz minőségét.

Szabályalapú ellenőrzések:

- történt-e keresési találat;
- kapott-e RAG-kontextust a modell;
- megtalálható-e az elvárt dokumentum;
- eléri-e a legjobb találat a minimális hasonlósági küszöböt.

A szabályalapú RAG-eredmény és az LLM as Judge eredménye eltérhet, mert más kérdésre válaszolnak:

```text
RAG-ellenőrzés:
Megtalálta-e a rendszer a szükséges dokumentumot?

LLM as Judge:
Megfelelően viselkedett-e az asszisztens a rendelkezésére álló források alapján?
```

## 11. Forrásalapú LLM as Judge

A Judge nemcsak a kérdést, a választ és az elvárt viselkedést kapja meg, hanem a ténylegesen visszakeresett receptchunkok szövegét is.

Pontozott szempontok:

- relevancia;
- utasításkövetés;
- groundedness;
- érthetőség;
- Multi-turn esetén kontextusmegőrzés;
- Multi-turn esetén következetesség.

Minden részpontszám 1 és 5 közötti egész szám. Az összpontszám a hat részpontszám átlaga. A megfelelési küszöb:

```text
overallScore >= 3.5
```

### Groundedness

A Judge külön ellenőrzi, hogy a válaszban szereplő következő adatok megtalálhatók-e a forrásokban:

- hozzávalók;
- mennyiségek;
- elkészítési idő;
- adagszám;
- étrendi tulajdonságok;
- helyettesítési javaslatok.

A forrással nem igazolható állítások külön listába kerülnek:

```json
{
  "unsupportedClaims": [
    "A recept 20 perc alatt elkészül.",
    "A recept 4 adaghoz elegendő."
  ]
}
```

A Judge különbséget tesz az alábbi állítások között:

```text
Óvatos, ellenőrizhető:
A most visszakeresett források között nem találtam megfelelő receptet.

Túl általános:
A teljes adatbázisban nincs megfelelő recept.
```

A relevancia, az érthetőség, a kontextusmegőrzés és a következetesség nem kap automatikusan alacsony pontot csak azért, mert nem sikerült megfelelő receptet találni. A korrekt, forráshű visszautasítás sikeres viselkedésnek számíthat.

## 12. Emberi értékelés

Minden mentett automatikus teszthez külön emberi értékelés készíthető.

Megadható:

- 1 és 5 közötti emberi pontszám;
- megfelelt vagy nem felelt meg állapot;
- egyetértés az LLM Judge eredményével;
- szöveges szakmai megjegyzés.

Az emberi értékelés külön JSON-fájlba kerül, az automatikus eredmény nem módosul.

## 13. Eredménymentés

Az eredmények helye:

```text
data/evaluation-results/
```

Példák:

```text
single-turn_....json
ab-test_....json
multi-turn_....json
rag_....json
human-review_....json
```

Minden fájl egyedi időbélyeget és rövid azonosítót kap.

## 14. Baseline és iteráció összehasonlítása

A felület két mentett automatikus eredményt hasonlít össze:

- baseline;
- iteráció utáni eredmény.

Összehasonlított mutatók:

- összpontszám;
- relevancia;
- utasításkövetés;
- groundedness;
- érthetőség;
- kontextusmegőrzés;
- következetesség;
- válaszidő;
- megfelelési állapot.

Korrekt összehasonlításhoz egyezzen:

- a teszttípus;
- a persona és a cél;
- a rejtett feltételek;
- a kezdő üzenet;
- a maximális fordulószám;
- az elvárt viselkedés;
- a modell és a Judge logikája.

Az adaptív szimuláció miatt a konkrét beszélgetési útvonal eltérhet. Ez nem hiba, hanem a teszt tárgya.

## 15. Végleges baseline mérés

A javított módszerrel három adaptív Multi-turn baseline-futás készült azonos konfigurációval.

| Futás      | Fordulók | Összpontszám | Megfelelt | Nem alátámasztott állítás | Teljes válaszidő |
| ---------- | -------: | -----------: | --------- | ------------------------: | ---------------: |
| Baseline 1 |        3 |         5,00 | Igen      |                         0 |           9,67 s |
| Baseline 2 |        3 |         5,00 | Igen      |                         0 |           9,87 s |
| Baseline 3 |        3 |         5,00 | Igen      |                         0 |           8,84 s |

Összesítés:

```text
Megfelelési arány: 3/3, 100%
Átlagos összpontszám: 5,00/5
Átlagos teljes válaszidő: 9,46 s
Nem alátámasztott állítások száma: 0
```

Mindhárom futásban:

- a User Simulator válaszfüggő üzeneteket generált;
- az asszisztens megőrizte a húsmentes és tejtermékmentes feltételeket;
- a források között nem talált egyértelműen megfelelő receptet;
- az asszisztens nem talált ki alternatívát;
- a Judge minden részszempontra 5 pontot adott;
- az `unsupportedClaims` lista üres maradt.

A baseline alapján további promptmódosítás nem indokolt ehhez a tesztesethez, mert mindhárom futás maximális pontszámot ért el. További fejlesztéshez nehezebb, más viselkedést vizsgáló teszteset szükséges.

## 16. Ismert korlátok

- A User Simulator maga is LLM-alapú, ezért a beszélgetési útvonal nem teljesen determinisztikus.
- A maximális fordulószám elérésekor a futási ciklus lezárul. A harmadik válasz után nem készül külön negyedik user üzenet.
- A Multi-turn Judge jelenleg elsősorban a végső asszisztensválaszhoz visszakeresett forrásokat kapja meg. A teljes beszélgetés minden asszisztensfordulójának külön forráskapcsolása további fejlesztés lehet.
- A helyi JSON-fájlmentés fejlesztői környezethez készült.
- Az összehasonlító panel egyszerre két futást hasonlít össze, három vagy több futás átlagát nem számolja automatikusan.
- A válaszidőt az API és a hálózat pillanatnyi terhelése is befolyásolja.
- A maximális, 5,00 pontos baseline plafonhatást okoz, ezért ugyanebben a tesztesetben további javulás nem mérhető.

## 17. Továbbfejlesztési lehetőségek

- fordulónkénti RAG-források mentése és Judge-nak történő átadása;
- az utolsó asszisztensválasz után külön lezárási döntés kérése a User Simulatortól;
- több különböző persona és regressziós tesztkészlet;
- kötegelt tesztfuttatás;
- átlag, minimum, maximum és szórás automatikus számítása;
- eredmények adatbázisban történő tárolása;
- CSV- vagy Excel-export;
- grafikonok és trendek;
- több emberi értékelő eredményeinek összevetése.

## 18. Technikai ellenőrzés

```powershell
npm run lint
npm run build
npm run dev
```

## 19. Összegzés

A jelenlegi Evaluációs Központ már nem merev, előre megírt Multi-turn scriptet futtat. A rendszer valódi strukturált beszélgetési előzményt továbbít, az adaptív User Simulator az asszisztens válaszaira reagál, a Judge pedig a tényleges RAG-források alapján értékeli a groundedness tulajdonságot.

A három végleges baseline-futás mindegyike megfelelt. Az asszisztens stabilan megőrizte a fokozatosan közölt étkezési korlátozásokat, és megfelelő forrás hiányában nem talált ki nem igazolt receptet vagy helyettesítést.
