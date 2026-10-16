import RecipeAssistantApp from "@/components/RecipeAssistantApp";

import styles from "./page.module.css";

/*
 * Az alkalmazás kezdőoldala.
 *
 * Az oldal Server Component maradhat.
 * Az interaktív működés a RecipeAssistantApp
 * Client Componentben található.
 */
export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.pageContainer}>
        <header className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.eyebrow}>
              AI Engineering házi feladat
            </div>

            <h1 className={styles.title}>
              AI Receptasszisztens
            </h1>

            <p className={styles.subtitle}>
              Tölts fel receptdokumentumokat,
              dolgozd fel őket embeddingekké,
              majd kérdezz a receptadatbázis
              tartalmáról.
            </p>
          </div>

          <div
            className={styles.architectureCard}
          >
            <span>Next.js</span>
            <span>OpenAI</span>
            <span>PostgreSQL</span>
            <span>pgvector</span>
          </div>
        </header>

        <RecipeAssistantApp />

        <footer className={styles.footer}>
          <p>
            A válaszokat mindig ellenőrizd az
            eredeti receptforrások alapján.
          </p>
        </footer>
      </div>
    </main>
  );
}