import Link from "next/link";
import EvaluationDashboard from "../../components/evaluation/EvaluationDashboard";
import ResultsComparison from "../../components/evaluation/ResultsComparison";

export default function EvaluationPage() {
  return (
    <main>
      <EvaluationDashboard />

      <ResultsComparison />

      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto 40px",
          padding: "0 24px",
        }}
      >
        <Link href="/">
          Vissza a receptasszisztenshez
        </Link>
      </div>
    </main>
  );
}