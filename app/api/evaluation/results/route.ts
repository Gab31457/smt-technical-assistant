import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

interface JudgeData {
  relevance?: number;
  instructionFollowing?: number;
  groundedness?: number;
  clarity?: number;
  contextRetention?: number;
  consistency?: number;
  overallScore?: number;
  passed?: boolean;
}

interface EvaluationData {
  responseTime?: number;
  judge?: JudgeData;
}

interface SavedResult {
  savedAt?: string;
  evaluationType?: string;
  result?: EvaluationData;
  finalEvaluation?: EvaluationData;
  evaluation?: EvaluationData;
  results?: EvaluationData[];
}

interface ResultSummary {
  fileName: string;
  savedAt: string;
  evaluationType: string;
  responseTime: number;
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  contextRetention: number;
  consistency: number;
  overallScore: number;
  passed: boolean;
}

// Beolvassa és egységes formára alakítja az eredményeket.
export async function GET() {
  try {
    const directory = path.join(
      process.cwd(),
      "data",
      "evaluation-results"
    );

    let fileNames: string[] = [];

    try {
      fileNames = await readdir(directory);
    } catch {
      return NextResponse.json({
        success: true,
        results: [],
      });
    }

    const automaticFiles = fileNames.filter(
      (fileName) =>
        fileName.endsWith(".json") &&
        !fileName.startsWith("human-review_") &&
        !fileName.startsWith("rag-batch_")
    );

    const results: ResultSummary[] = [];

    for (const fileName of automaticFiles) {
      try {
        const filePath = path.join(
          directory,
          fileName
        );

        const content = await readFile(
          filePath,
          "utf-8"
        );

        const parsed =
          JSON.parse(content) as SavedResult;

        results.push(
          createSummary(fileName, parsed)
        );
      } catch (fileError) {
        console.error(
          `Nem sikerült beolvasni: ${fileName}`,
          fileError
        );
      }
    }

    results.sort((first, second) =>
      second.savedAt.localeCompare(first.savedAt)
    );

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Results API hiba:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Az eredmények beolvasása sikertelen.",
      },
      {
        status: 500,
      }
    );
  }
}

// Egységes összefoglalót készít egy eredményfájlból.
function createSummary(
  fileName: string,
  savedResult: SavedResult
): ResultSummary {
  const evaluationType =
    savedResult.evaluationType || "ismeretlen";

  if (
    evaluationType === "ab-test" &&
    savedResult.results &&
    savedResult.results.length >= 2
  ) {
    return createAbSummary(
      fileName,
      savedResult
    );
  }

  const evaluation =
    savedResult.result ||
    savedResult.finalEvaluation ||
    savedResult.evaluation;

  return buildSummary(
    fileName,
    savedResult.savedAt || "",
    evaluationType,
    evaluation
  );
}

// Az A/B teszt két változatából átlagot számít.
function createAbSummary(
  fileName: string,
  savedResult: SavedResult
): ResultSummary {
  const first = savedResult.results?.[0];
  const second = savedResult.results?.[1];

  return {
    fileName,
    savedAt: savedResult.savedAt || "",
    evaluationType: "ab-test",
    responseTime: average(
      first?.responseTime,
      second?.responseTime
    ),
    relevance: average(
      first?.judge?.relevance,
      second?.judge?.relevance
    ),
    instructionFollowing: average(
      first?.judge?.instructionFollowing,
      second?.judge?.instructionFollowing
    ),
    groundedness: average(
      first?.judge?.groundedness,
      second?.judge?.groundedness
    ),
    clarity: average(
      first?.judge?.clarity,
      second?.judge?.clarity
    ),
    contextRetention: average(
      first?.judge?.contextRetention,
      second?.judge?.contextRetention
    ),
    consistency: average(
      first?.judge?.consistency,
      second?.judge?.consistency
    ),
    overallScore: average(
      first?.judge?.overallScore,
      second?.judge?.overallScore
    ),
    passed:
      first?.judge?.passed === true &&
      second?.judge?.passed === true,
  };
}

// Normál teszteredményből készít összefoglalót.
function buildSummary(
  fileName: string,
  savedAt: string,
  evaluationType: string,
  evaluation?: EvaluationData
): ResultSummary {
  const judge = evaluation?.judge;

  return {
    fileName,
    savedAt,
    evaluationType,
    responseTime: Number(
      evaluation?.responseTime || 0
    ),
    relevance: Number(
      judge?.relevance || 0
    ),
    instructionFollowing: Number(
      judge?.instructionFollowing || 0
    ),
    groundedness: Number(
      judge?.groundedness || 0
    ),
    clarity: Number(
      judge?.clarity || 0
    ),
    contextRetention: Number(
      judge?.contextRetention || 0
    ),
    consistency: Number(
      judge?.consistency || 0
    ),
    overallScore: Number(
      judge?.overallScore || 0
    ),
    passed: judge?.passed === true,
  };
}

// Két érték átlagát számítja ki.
function average(
  firstValue: unknown,
  secondValue: unknown
) {
  const firstNumber = Number(firstValue || 0);
  const secondNumber = Number(secondValue || 0);

  return Number(
    ((firstNumber + secondNumber) / 2).toFixed(2)
  );
}