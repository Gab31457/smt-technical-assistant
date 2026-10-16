# AI Receptasszisztens és Evaluációs Központ

A projekt egy Next.js és TypeScript alapú AI receptasszisztenst, valamint egy különálló evaluációs felületet tartalmaz.

Az AI-asszisztens részletes használati és technikai dokumentációja:

```text
README_AI-Assystant.md
```

Az Evaluációs Központ részletes dokumentációja:

```text
README_Evaluation.md
```

## Előfeltételek

A projekt futtatásához szükséges:

- Node.js
- npm
- OpenAI API-kulcs
- működő PostgreSQL-adatbázis
- pgvector bővítmény
- megfelelő környezeti változók

A szükséges csomagok és szolgáltatások felsorolása a következő fájlban található:

```text
requirements.txt
```

## Csomagok telepítése

A projekt gyökérkönyvtárában futtasd:

```powershell
npm install
```

## Környezeti változók

A szükséges környezeti változókat a projekt gyökérkönyvtárában található környezeti fájlban kell megadni.

Javasolt fájlnév:

```text
.env.local
```

A környezeti fájlokat és az API-kulcsokat nem szabad GitHubra feltölteni.

## A projekt indítása

A projekt gyökérkönyvtárában futtasd:

```powershell
npm run dev
```

A parancs egyszerre indítja el:

- az AI Receptasszisztenst;
- az Evaluációs Központot;
- a dokumentumkezelési funkciókat;
- a szükséges API-végpontokat.

## AI Receptasszisztens

Az AI Receptasszisztens a következő címen érhető el:

```text
http://localhost:3000
```

A részletes használati leírás:

```text
README_AI-Assystant.md
```

## Evaluációs Központ

Az Evaluációs Központ külön oldalon érhető el:

```text
http://localhost:3000/evaluation
```

Az evaluációs felületet nem kell külön paranccsal elindítani. A felület automatikusan elérhető az `npm run dev` parancs futtatása után.

A részletes használati leírás:

```text
README_Evaluation.md
```

## Eredménylista API

Az evaluáció mentett eredményeit a következő belső API-végpont listázza:

```text
http://localhost:3000/api/evaluation/results
```

Ezt az API-végpontot nem kell külön elindítani, és normál használat közben nem szükséges közvetlenül megnyitni a böngészőben.

Az Evaluációs Központ automatikusan használja az eredmények betöltéséhez. A közvetlen böngészős megnyitás csak ellenőrzéshez vagy hibakereséshez szükséges.

## Port használata

A fejlesztői szerver alapértelmezett címe:

```text
http://localhost:3000
```

Ha a 3000-es port foglalt, a Next.js másik portot használhat, például:

```text
http://localhost:3001
```

Ebben az esetben az AI-asszisztens és az Evaluációs Központ eléréséhez is a terminálban megjelenő portot kell használni.

## Technikai ellenőrzés

Kódellenőrzés:

```powershell
npm run lint
```

Production build ellenőrzése:

```powershell
npm run build
```

Fejlesztői szerver indítása:

```powershell
npm run dev
```

## Gyors indítási összefoglaló

```powershell
npm install
npm run dev
```

Ezután nyisd meg az AI-asszisztenst:

```text
http://localhost:3000
```

Vagy az Evaluációs Központot:

```text
http://localhost:3000/evaluation
```