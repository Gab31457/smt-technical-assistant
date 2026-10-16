import RecipeAssistantApp from "@/components/RecipeAssistantApp";
import styles from "./page.module.css";

/*
 * Az SMT Technical Assistant kezdőoldala.
 *
 * Az oldal Server Component marad.
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
              Intelligens gyártástámogatás
            </div>

            <h1 className={styles.title}>
              SMT Technical Assistant
            </h1>

            <p className={styles.subtitle}>
              Töltse fel az SMT műszaki dokumentumokat, majd kérdezzen
              a dokumentumbázis tartalmáról. Az asszisztens a
              feldolgozott források alapján segít a műszaki
              információk gyors visszakeresésében.
            </p>
          </div>

          <div className={styles.architectureCard}>
            <span>Műszaki tudásbázis</span>
            <span>Dokumentumkeresés</span>
            <span>Forrásalapú válaszok</span>
            <span>AI-támogatás</span>
          </div>
        </header>

        <RecipeAssistantApp />

        <footer className={styles.footer}>
          <p>
            A válaszokat mindig ellenőrizze az eredeti
            műszaki dokumentumok alapján.
          </p>
        </footer>
      </div>
    </main>
  );
}
