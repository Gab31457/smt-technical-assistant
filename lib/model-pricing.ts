export interface ModelTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelPricing {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

function readNonNegativeNumber(
  value: string | undefined
): number {
  const parsedValue = Number(value);

  if (
    !Number.isFinite(parsedValue) ||
    parsedValue < 0
  ) {
    return 0;
  }

  return parsedValue;
}

export function getConfiguredModelPricing(): ModelPricing {
  return {
    inputUsdPerMillionTokens: readNonNegativeNumber(
      process.env.OPENAI_INPUT_COST_PER_1M_TOKENS
    ),
    outputUsdPerMillionTokens: readNonNegativeNumber(
      process.env.OPENAI_OUTPUT_COST_PER_1M_TOKENS
    ),
  };
}

export function calculateEstimatedCostUsd(
  usage: ModelTokenUsage,
  pricing: ModelPricing = getConfiguredModelPricing()
): number {
  const inputCost =
    (usage.inputTokens / 1_000_000) *
    pricing.inputUsdPerMillionTokens;
  const outputCost =
    (usage.outputTokens / 1_000_000) *
    pricing.outputUsdPerMillionTokens;

  return Number((inputCost + outputCost).toFixed(8));
}
