import type { Observation } from '../types.js';
import type { DatabaseLayer } from '../database/index.js';
import { getAIProvider } from '../ai/index.js';

export interface ContradictionCheckResult {
  hasContradiction: boolean;
  conflictingObservation?: Observation;
  reason?: string;
  suggestion?: string;
}

const NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bnever\b/i,
  /\bno longer\b/i,
  /\binstead of\b/i,
  /\bdeprecated\b/i,
  /\bremoved\b/i,
  /\bdisabled\b/i,
  /\breplaced by\b/i,
  /\bmigrated from\b/i,
  /\bswitched from\b/i,
  /\btidak lagi\b/i,
  /\bbukan\b/i,
  /\bjangan\b/i,
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

export function detectRuleBasedContradiction(
  incomingContent: string,
  existingObservations: Observation[]
): ContradictionCheckResult {
  const incomingTokens = tokenize(incomingContent);
  const incomingHasNegation = NEGATION_PATTERNS.some((pattern) => pattern.test(incomingContent));

  for (const existing of existingObservations) {
    if (existing.status !== 'active') continue;

    const existingTokens = tokenize(existing.content);
    const existingHasNegation = NEGATION_PATTERNS.some((pattern) => pattern.test(existing.content));

    // Calculate token overlap
    const intersection = new Set([...incomingTokens].filter((t) => existingTokens.has(t)));
    const overlapRatio = intersection.size / Math.min(incomingTokens.size, existingTokens.size || 1);

    // If high overlap (>= 50%) but one has negation and the other does not
    if (overlapRatio >= 0.5 && incomingHasNegation !== existingHasNegation) {
      return {
        hasContradiction: true,
        conflictingObservation: existing,
        reason: `Contradiction detected: polar opposition on overlapping topic ("${[...intersection].slice(0, 3).join(', ')}")`,
        suggestion: `The existing fact is: "${existing.content}" [${existing.authorityTier}]. Consider updating or superseding it instead of adding a conflicting fact.`,
      };
    }

    // Direct replacement pattern (e.g. "X instead of Y" where Y is in existing observation)
    const insteadMatch = incomingContent.match(/instead of\s+([a-zA-Z0-9_-]+)/i);
    if (insteadMatch && existing.content.toLowerCase().includes(insteadMatch[1].toLowerCase())) {
      return {
        hasContradiction: true,
        conflictingObservation: existing,
        reason: `Explicit replacement detected: "${incomingContent}" replaces "${insteadMatch[1]}"`,
        suggestion: `The existing fact mentions "${insteadMatch[1]}". Consider superseding observation ${existing.id}.`,
      };
    }
  }

  return { hasContradiction: false };
}

export async function checkContradiction(
  incomingContent: string,
  entityId: string,
  db: DatabaseLayer,
  useAI = false
): Promise<ContradictionCheckResult> {
  const activeObservations = db.getObservationsByEntity(entityId, true);
  if (activeObservations.length === 0) {
    return { hasContradiction: false };
  }

  // 1. Fast rule-based detection
  const ruleResult = detectRuleBasedContradiction(incomingContent, activeObservations);
  if (ruleResult.hasContradiction) {
    return ruleResult;
  }

  // 2. Optional AI check
  const provider = getAIProvider();
  if (useAI && provider.name !== 'none') {
    try {
      const prompt = `You are a strict contradiction detector for an AI knowledge graph.
Analyze if the INCOMING FACT directly contradicts any of the EXISTING FACTS for this entity.

EXISTING FACTS:
${activeObservations.map((o) => `[ID: ${o.id}] ${o.content}`).join('\n')}

INCOMING FACT:
"${incomingContent}"

If there is a direct factual contradiction, respond with JSON:
{ "hasContradiction": true, "conflictingId": "ID", "reason": "concise explanation" }
If there is NO contradiction, respond with:
{ "hasContradiction": false }`;

      const response = await provider.chat([
        { role: 'system', content: 'You are a precise contradiction detector. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.hasContradiction && parsed.conflictingId) {
          const conflicting = activeObservations.find((o) => o.id === parsed.conflictingId);
          return {
            hasContradiction: true,
            conflictingObservation: conflicting,
            reason: parsed.reason || 'AI detected semantic contradiction',
            suggestion: `Conflicting fact found: "${conflicting?.content}". Consider superseding it.`,
          };
        }
      }
    } catch (e) {
      console.warn('AI contradiction detection error:', e);
    }
  }

  return { hasContradiction: false };
}
