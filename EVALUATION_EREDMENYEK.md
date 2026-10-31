# Evaluation eredmények

## 1. A dokumentum célja

Ez a dokumentum az `smt-technical-assistant` projekt végleges evaluációs eredményeit foglalja össze. Az értékelés célja annak ellenőrzése volt, hogy a rendszer:

- megfelelő dokumentumrészeket keres-e vissza;
- forráshű és érthető válaszokat készít-e;
- betartja-e a kiválasztott rendszerprompt utasításait;
- kezeli-e a többfordulós beszélgetési kontextust;
- megfelelően működteti-e a dokumentum-, adatbázis- és chatfunkciókat;
- mérhető válaszidővel, tokenhasználattal és becsült költséggel működik-e.

Az összesített eredmények a projekt saját Evaluation rendszerével készültek. A részletes futási eredmények JSON-formátumban a következő mappában találhatók:

```text
data/evaluation-results
```

## 2. Értékelési környezet

A vizsgált rendszer főbb elemei:

- Next.js 16 és TypeScript;
- PostgreSQL és pgvector;
- OpenAI chat- és embeddingmodellek;
- többnyelvű RAG-keresés;
- tartós PostgreSQL-alapú chatmemória;
- streamelt válaszgenerálás;
- helyi OpenTelemetry-instrumentáció;
- saját LLM-as-Judge és User Simulator alapú értékelés.

A tesztekhez használt dokumentumtípusok:

- PDF;
- DOCX;
- XLSX;
- TXT.

A tesztkészlet magyar és angol kérdéseket egyaránt tartalmazott. A dokumentumkeresést a kötelező tesztekben előre meghatározott releváns dokumentumokra korlátoztuk, hogy a mérés reprodukálható és egyértelmű legyen.

## 3. Összesített eredmények

| Evaluáció típusa | Tesztesetek | Megfelelt | Sikertelen | Megfelelési arány |
|---|---:|---:|---:|---:|
| RAG batch | 20 | 20 | 0 | 100% |
| Prompt batch | 15 | 15 | 0 | 100% |
| Application batch | 10 | 10 | 0 | 100% |
| Multi-turn | 1 háromfordulós szcenárió | 1 | 0 | 100% |

A három batch futás összesen:

- **45 tesztesetet** hajtott végre;
- **45 teszteset felelt meg**;
- **0 technikai hiba** történt;
- összesen **171 190 token** került felhasználásra;
- a becsült összköltség **0,0314592 USD** volt.

A Multi-turn futás külön szcenárióként került mentésre, ezért annak mérési adatai külön szerepelnek.

## 4. RAG batch evaluáció

### 4.1. Tesztkészlet

A RAG batch **20 tesztesetet** tartalmazott. A tesztek az alábbiakat vizsgálták:

- releváns dokumentumrészek visszakeresése;
- PDF-, DOCX-, XLSX- és TXT-dokumentumok kezelése;
- magyar és angol kérdések feldolgozása;
- dokumentumszintű SQL-szűrés;
- Top K találatok minősége;
- retrieval idő;
- válaszgenerálás sikeressége.

A tesztadatok helye:

```text
data/evaluation-test-cases/rag-test-cases.json
```

A végleges eredményfájl:

```text
data/evaluation-results/rag-batch_2026-10-23T10-08-16.515Z_18c21d.json
```

### 4.2. Végleges eredmények

| Mutató | Eredmény |
|---|---:|
| Tesztesetek száma | 20 |
| Sikeresen lefutott tesztek | 20 |
| Megfelelt tesztek | 20 |
| Technikai hibák | 0 |
| Megfelelési arány | 100% |
| Átlagos Precision@K | 0,32 |
| Átlagos Recall@K | 0,8667 |
| Átlagos MRR | 0,7558 |
| Átlagos retrieval idő | 397,75 ms |
| Átlagos teljes válaszidő | 5 896,65 ms |
| Inputtokenek | 77 087 |
| Outputtokenek | 6 208 |
| Összes token | 83 295 |
| Becsült költség | 0,01528785 USD |

### 4.3. Releváns találatok helyezése

A 20 tesztben az első releváns dokumentumrész helyezése:

- 12 esetben az 1. hely;
- 4 esetben a 2. hely;
- 2 esetben a 3. hely;
- 1 esetben a 4. hely;
- 1 esetben az 5. hely.

Az első releváns találat átlagos helyezése **1,75** volt. A releváns információ minden tesztnél bekerült a végső Top 5 találat közé.

### 4.4. Dokumentumtípusonkénti eredmények

| Dokumentumtípus | Tesztek | Precision@5 | Recall@5 | MRR | Első releváns hely átlaga | Átlagos retrieval idő |
|---|---:|---:|---:|---:|---:|---:|
| PDF | 12 | 0,30 | 0,861 | 0,896 | 1,33 | 406,58 ms |
| DOCX | 4 | 0,30 | 0,75 | 0,417 | 2,50 | 407,75 ms |
| XLSX | 2 | 0,20 | 1,00 | 0,60 | 3,00 | 366,50 ms |
| TXT | 2 | 0,60 | 1,00 | 0,75 | 1,50 | 356,00 ms |

A PDF-keresés adta a legerősebb rangsorolási eredményt. A TXT- és XLSX-tesztek teljes Recall@5 eredményt értek el. A DOCX-találatok átlagosan későbbi helyre kerültek, de minden DOCX-alapú teszt sikeresen megfelelt.

### 4.5. Nyelvenkénti eredmények

| Kérdés nyelve | Tesztek | Precision@5 | Recall@5 | MRR | Első releváns hely átlaga |
|---|---:|---:|---:|---:|---:|
| Magyar | 15 | 0,333 | 0,867 | 0,741 | 1,87 |
| Angol | 5 | 0,280 | 0,867 | 0,800 | 1,40 |

A magyar és angol kérdések Recall@5 értéke azonos szintű volt. Ez igazolja, hogy a kétnyelvű keresés kontrollált tesztkörnyezetben mindkét nyelven megfelelően működik.

### 4.6. Precision@K értelmezése

A 0,32-es átlagos Precision@K önmagában nem jelent hibát. A Top 5 listában több tesztnél csak egy vagy két chunk volt előre relevánsként megjelölve. Ilyen esetben egy tökéletesen megtalált egyetlen releváns chunk Precision@5 értéke 0,2, két releváns chunké pedig 0,4.

A rendszer szempontjából a legfontosabb eredmény, hogy:

- minden tesztnél volt releváns találat;
- egyetlen teszt Recall@5 értéke sem volt nulla;
- mind a 20 válasz megfelelt.

## 5. Prompt batch evaluáció

### 5.1. Tesztkészlet

A Prompt batch **15 tesztesetet** tartalmazott. A tesztek az alábbiakat vizsgálták:

- válaszrelevancia;
- utasításkövetés;
- forráshűség;
- érthetőség;
- magyar és angol kérdések kezelése;
- dokumentumban szereplő és nem szereplő információk elkülönítése;
- nem alátámasztott állítások felismerése.

A tesztadatok helye:

```text
data/evaluation-test-cases/prompt-test-cases.json
```

A végleges eredményfájl:

```text
data/evaluation-results/prompt-batch_2026-10-23T10-18-46.057Z_d84dcb.json
```

### 5.2. Végleges eredmények

| Mutató | Eredmény |
|---|---:|
| Tesztesetek száma | 15 |
| Megfelelt tesztek | 15 |
| Technikai hibák | 0 |
| Megfelelési arány | 100% |
| Átlagos relevancia | 5/5 |
| Átlagos utasításkövetés | 5/5 |
| Átlagos forráshűség | 5/5 |
| Átlagos érthetőség | 5/5 |
| Átlagos összpontszám | 5/5 |
| Nem alátámasztott állítások | 0 |
| Átlagos retrieval idő | 360,60 ms |
| Átlagos generálási idő | 4 182,53 ms |
| Átlagos teljes válaszidő | 5 756 ms |
| Inputtokenek | 57 788 |
| Outputtokenek | 4 439 |
| Összes token | 62 227 |
| Becsült költség | 0,0113316 USD |

### 5.3. Értékelés

Az LLM-as-Judge minden vizsgált minőségi szempontnál maximális átlagpontszámot adott. Nem jelent meg nem alátámasztott állítás, ezért a végleges promptok megfelelően támogatják a forráshű műszaki válaszadást.

## 6. Application batch evaluáció

### 6.1. Tesztkészlet

Az Application batch **10 összetett alkalmazásszintű tesztesetet** és összesen **22 tesztlépést** tartalmazott.

A tesztek többek között ellenőrizték:

- a dokumentumlista működését;
- a dokumentumfeldolgozás állapotát;
- az embeddingek meglétét;
- a dokumentumszűrést;
- a PDF-forrásmetaadatokat;
- az XLSX-forrásmetaadatokat;
- a tudásforrás-módokat;
- a válaszadási módokat;
- a chat mentését és visszatöltését;
- a beszélgetések törlését.

A tesztadatok helye:

```text
data/evaluation-test-cases/application-test-cases.json
```

A végleges eredményfájl:

```text
data/evaluation-results/application-batch_2026-10-23T10-23-05.526Z_27b64e.json
```

### 6.2. Végleges eredmények

| Mutató | Eredmény |
|---|---:|
| Tesztesetek száma | 10 |
| Megfelelt tesztek | 10 |
| Tesztlépések száma | 22 |
| Megfelelt tesztlépések | 22 |
| Technikai hibák | 0 |
| Teszteset-megfelelés | 100% |
| Tesztlépés-megfelelés | 100% |
| Átlagos teszteset-időtartam | 3 746,90 ms |
| Átlagos retrieval idő | 229,50 ms |
| Átlagos generálási idő | 3 174,80 ms |
| Átlagos teljes válaszidő | 4 107,40 ms |
| Inputtokenek | 23 469 |
| Outputtokenek | 2 199 |
| Összes token | 25 668 |
| Becsült költség | 0,00483975 USD |

### 6.3. Értékelés

Az eredmény igazolja, hogy az alkalmazás fő végpontjai és felhasználói folyamatai együtt is megfelelően működnek. A dokumentumkezelés, a dokumentumszűrés, a forrásmetaadatok és a tartós chatmemória minden vizsgált lépésben megfelelt.

## 7. Multi-turn evaluáció

### 7.1. Teszt célja

A háromfordulós Multi-turn teszt az alábbi képességeket vizsgálta:

- ugyanazon műszaki téma megőrzése több fordulón keresztül;
- korábbi válaszokra történő visszautalás kezelése;
- források következetes használata;
- dokumentált műszaki értékek megtartása;
- válaszok közötti következetesség.

A végleges eredményfájl:

```text
data/evaluation-results/multi-turn_2026-10-23T10-42-45.312Z_177154.json
```

### 7.2. Tesztmenet

A teszt az ESD-csuklópánt követelményeit vizsgálta a `Test1_nasa-std-87396b.pdf` dokumentumban.

A rendszer helyesen azonosította:

- a csuklópánt ellenállási tartományát: **800 kΩ és 1,2 MΩ között**;
- a földelőcsatlakozó megengedett ellenállását: **kisebb mint 1 Ω**;
- a releváns `94` és `95` chunkokat.

A harmadik fordulóban a rendszer mindkét korábbi műszaki értéket és a hozzájuk tartozó dokumentumforrásokat következetesen kezelte.

### 7.3. Végleges minőségi értékelés

| Szempont | Eredmény |
|---|---:|
| Relevancia | 5/5 |
| Utasításkövetés | 5/5 |
| Forráshűség | 5/5 |
| Érthetőség | 5/5 |
| Kontextusmegőrzés | 5/5 |
| Következetesség | 5/5 |
| Összpontszám | 5/5 |
| Nem alátámasztott állítások | 0 |
| Megfelelt | Igen |

### 7.4. Teljesítményadatok

- három forduló teljes futásideje: **16 287,30 ms**;
- a végső forduló teljes válaszideje: **5 972 ms**;
- keresőkérdés-generálás: **1 985 ms**;
- vektorkeresés: **787 ms**;
- válaszgenerálás: **3 199 ms**;
- inputtokenek a végső fordulóban: **4 573**;
- outputtokenek a végső fordulóban: **231**;
- összes token a végső fordulóban: **4 804**;
- becsült költség a végső fordulóban: **0,00082455 USD**;
- felhasznált chunkok száma: **5**.

## 8. Retrieval-regressziós ellenőrzés

A batch teszteken kívül külön kétfordulós retrieval-regressziós ellenőrzés is történt.

A teszt első kérdése a GrifEye V2 sűrített levegős csatlakozási követelményeire vonatkozott. A második kérdés ugyanabban a beszélgetésben kizárta a GrifEye témát, és a NASA-dokumentum ESD-csuklópánt-ellenállását kérdezte.

A rendszer sikeresen:

- felismerte a témaváltást;
- eltávolította a korábbi GrifEye pneumatikus kontextust;
- nem vitte tovább a `8 bar`, `50 l/perc`, `compressed air` és kapcsolódó kifejezéseket;
- a NASA ESD-csuklópánt követelményeire keresett;
- a `94` és `95` chunkokat találta meg;
- helyesen adta vissza a **800 kΩ és 1,2 MΩ közötti** értéket;
- nem keverte bele a GrifEye pneumatikus adatait.

Ez igazolja, hogy a keresőkérdés-generálás kezeli a tagadást, a korábbi feltételezés felülírását és a témaváltást.

## 9. Single-turn evaluáció

A projekt tartalmaz Single-turn evaluációs funkciót és külön tesztadatfájlt:

```text
data/evaluation-test-cases/single-turn-test-cases.json
```

A Single-turn evaluáció külön, reprezentatív teszteléssel használható. Ehhez nem készült további külön batch fejlesztés, mert a projekt kötelező RAG-, prompt-, Application- és Multi-turn ellenőrzései már sikeresen teljesültek.

## 10. Embedding- és chunkinghatékonyság értékelése

Az embedding- és chunkingstratégia a végleges RAG batch alapján megfelelőnek tekinthető.

Fő megállapítások:

- minden RAG-tesztben bekerült legalább egy releváns chunk a Top 5-be;
- 15 tesztben teljes Recall@5 eredmény született;
- 5 tesztben részleges, de nullánál nagyobb Recall@5 eredmény született;
- egyetlen tesztnél sem volt nulla Recall@5;
- a releváns chunk átlagosan az 1,75. helyen jelent meg;
- minden támogatott dokumentumtípusból sikerült megfelelő választ készíteni;
- az XLSX-feldolgozás mindkét tesztje sikeres volt;
- a kétnyelvű retrieval magyar és angol kérdések esetében is megfelelő eredményt adott.

A mérési eredmények alapján nincs szükség további kötelező chunking- vagy embeddingmódosításra.

## 11. Korlátozások

Az evaluáció eredményeinek értelmezésekor a következő korlátozásokat figyelembe kell venni:

- a kötelező tesztek előre meghatározott releváns dokumentumokat használtak;
- az összes dokumentumban egyszerre történő keresés zajosabb lehet;
- a DOCX-találatok rangsorolása gyengébb volt a PDF-találatokénál, de minden végleges DOCX-teszt megfelelt;
- OCR nincs beépítve;
- a szövegréteg nélküli PDF-ek nem képezik a támogatott tesztkörnyezet részét;
- az LLM-alapú értékelés modellfüggő, ezért ugyanazon teszt ismételt futtatásakor kisebb eltérés előfordulhat;
- a költségadatok a projektben megadott tokenárak alapján készült becslések.

## 12. Végső következtetés

A végleges evaluációs eredmények alapján az `smt-technical-assistant` teljesíti a projekt kötelező értékelési követelményeit.

A rendszer:

- 20/20 RAG-tesztet teljesített;
- 15/15 prompttesztet teljesített;
- 10/10 alkalmazásszintű tesztet és 22/22 tesztlépést teljesített;
- sikeresen teljesítette a háromfordulós Multi-turn tesztet;
- kezelte a retrieval-regressziós témaváltást;
- magyar és angol kérdések esetén is megfelelő retrieval eredményt adott;
- minden támogatott dokumentumtípusból képes volt releváns információt visszakeresni;
- technikai hiba nélkül hajtotta végre a végleges batch futásokat;
- mérhető válaszidővel, tokenhasználattal és alacsony becsült API-költséggel működött.

A projekt evaluációs része ezért lezártnak és megfelelőnek tekinthető.
