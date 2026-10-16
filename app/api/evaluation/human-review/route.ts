import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

interface HumanReviewRequest {
  evaluationFileName?: string;
  humanScore?: number;
  passed?: boolean;
  agreesWithJudge?: boolean;
  comment?: string;
}

// Elmenti az emberi értékelést külön JSON-fájlba.
export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as HumanReviewRequest;

    const humanScore = Number(body.humanScore);
    const comment = String(body.comment ?? "").trim();
    const evaluationFileName = String(
      body.evaluationFileName ?? ""
    ).trim();

    if (
      !Number.isInteger(humanScore) ||
      humanScore < 1 ||
      humanScore > 5
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Az emberi pontszám 1 és 5 közötti egész szám legyen.",
        },
        {
          status: 400,
        }
      );
    }

    if (typeof body.passed !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          message:
            "A megfelelt vagy nem felelt meg érték megadása kötelező.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof body.agreesWithJudge !== "boolean"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Add meg, hogy egyetértesz-e az LLM Judge értékelésével.",
        },
        {
          status: 400,
        }
      );
    }

    const outputDirectory = path.join(
      process.cwd(),
      "data",
      "evaluation-results"
    );

    await mkdir(outputDirectory, {
      recursive: true,
    });

    const timestamp = new Date()
      .toISOString()
      .replaceAll(":", "-");

    const shortId = randomUUID().slice(0, 6);

    const fileName =
      `human-review_${timestamp}_${shortId}.json`;

    const filePath = path.join(
      outputDirectory,
      fileName
    );

    const review = {
      reviewType: "human-review",
      savedAt: new Date().toISOString(),
      evaluationFileName,
      humanScore,
      passed: body.passed,
      agreesWithJudge: body.agreesWithJudge,
      comment,
    };

    await writeFile(
      filePath,
      JSON.stringify(review, null, 2),
      "utf-8"
    );

    return NextResponse.json({
      success: true,
      fileName,
    });
  } catch (error) {
    console.error("Emberi értékelés mentési hiba:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Az emberi értékelés mentése sikertelen.",
      },
      {
        status: 500,
      }
    );
  }
}