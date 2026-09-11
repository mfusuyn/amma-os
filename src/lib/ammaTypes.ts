/**
 * AMMA OS — shared judgment type, used by both client and server.
 */

export type AmmaVerdict = "APPROVED" | "REJECTED";

export interface AmmaJudgment {
  whatAmmaSees: string;
  analysis: string[];
  financialDamage: string;
  ammasConcern: string;
  relativeComparison: string;
  verdict: AmmaVerdict;
  verdictReason: string;
}
