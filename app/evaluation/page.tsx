import Link from "next/link";
import EvaluationDashboard from "../../components/evaluation/EvaluationDashboard";
import ResultsComparison from "../../components/evaluation/ResultsComparison";
import styles from "../../components/RecipeAssistantApp.module.css";

export default function EvaluationPage() {
  return (
    <main>
      <nav
        className={styles.navigation}
        aria-label="Alkalmazasnezetek"
      >
        <Link
          href="/"
          className={styles.navigationButton}
        >
          Asszisztens
        </Link>

        <Link
          href="/?view=documents"
          className={styles.navigationButton}
        >
          Dokumentumkezeles
        </Link>

        <span className={styles.activeNavigationButton}>
          Evaluation
        </span>
      </nav>

      <EvaluationDashboard />
      <ResultsComparison />
    </main>
  );
}
