import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database.js';
import type { Observation } from '../types.js';
import { getAIProvider, synthesizeObservations } from '../ai/index.js';

export interface ConsolidationResult {
  purgedCount: number;
  supersededCount: number;
  consolidatedCount: number;
  details?: {
    purged: string[];
    superseded: Array<{ oldId: string; newId: string; reason: string }>;
    synthesized: Array<{ entityId: string; newObservationId: string; oldObservationIds: string[] }>;
  };
}

function getJaccardSimilarity(s1: string, s2: string): number {
  const words1 = new Set(s1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
  const words2 = new Set(s2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

export async function consolidateMemories(
  graph: KnowledgeGraph,
  db: DatabaseLayer,
  domain?: string
): Promise<ConsolidationResult> {
  const purgedCount = graph.cleanupExpired();

  // Retrieve entities matching domain
  const snapshot = graph.readGraph(domain);
  const entities = snapshot.entities;

  let supersededCount = 0;
  let consolidatedCount = 0;

  const supersededList: Array<{ oldId: string; newId: string; reason: string }> = [];
  const synthesizedList: Array<{ entityId: string; newObservationId: string; oldObservationIds: string[] }> = [];

  const provider = getAIProvider();

  for (const entity of entities) {
    // Get all observations for this entity that are not superseded and not expired
    const allObs = db.getObservationsByEntity(entity.id);
    const activeObs = allObs.filter((o) => !o.supersedes && (o.expiresAt === null || new Date(o.expiresAt).getTime() > Date.now()));

    if (activeObs.length < 2) {
      continue;
    }

    // 1. Conflict Resolution & Supersession via LLM or basic similarity
    let supersededIds = new Set<string>();

    if (provider.name !== 'none') {
      try {
        const prompt = `You are an AI assistant analyzing a list of observations for the entity "${entity.name}" (Type: "${entity.entityType}", Domain: "${entity.domain}").
Identify any pairs of observations where a newer observation conflicts with or updates/supersedes an older observation.
For example, if an older observation says "lives in Jakarta" and a newer one says "now lives in Bandung", the newer one supersedes the older one.
If an older observation says "likes acoustic guitars" and a newer one says "likes electric guitars instead of acoustic", the newer one supersedes the older one.

Observations:
${activeObs.map((o) => `[ID: ${o.id}] (Created: ${o.createdAt}) ${o.content}`).join('\n')}

Respond STRICTLY with a JSON array of objects, and absolutely nothing else. Each object in the array must look like this:
{ "olderId": "older_observation_uuid", "newerId": "newer_observation_uuid", "reason": "concise description of why newer updates/conflicts with older" }
If no observations conflict or update each other, return an empty array: []`;

        const responseText = await provider.chat([
          { role: 'system', content: 'You are a precise JSON generator. Output only valid JSON.' },
          { role: 'user', content: prompt }
        ]);

        const jsonStart = responseText.indexOf('[');
        const jsonEnd = responseText.lastIndexOf(']');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
          const conflicts = JSON.parse(jsonString) as Array<{ olderId: string; newerId: string; reason: string }>;
          for (const conf of conflicts) {
            // Verify IDs exist in activeObs
            const older = activeObs.find((o) => o.id === conf.olderId);
            const newer = activeObs.find((o) => o.id === conf.newerId);
            if (older && newer && !supersededIds.has(older.id)) {
              db.setSupersedes(older.id, newer.id, 'sleep_cycle');
              supersededIds.add(older.id);
              supersededList.push({ oldId: older.id, newId: newer.id, reason: conf.reason });
              supersededCount++;
            }
          }
        }
      } catch (err) {
        console.error(`LLM Conflict resolution failed for entity ${entity.name}:`, err);
      }
    }

    // Heuristic/Rules-based deduplication and conflict detection for remaining active observations
    const remainingObs = activeObs.filter((o) => !supersededIds.has(o.id));
    for (let i = 0; i < remainingObs.length; i++) {
      for (let j = i + 1; j < remainingObs.length; j++) {
        const obs1 = remainingObs[i];
        const obs2 = remainingObs[j];

        if (supersededIds.has(obs1.id) || supersededIds.has(obs2.id)) continue;

        // Check similarity
        const sim = getJaccardSimilarity(obs1.content, obs2.content);
        if (sim >= 0.8 || obs1.content.toLowerCase().trim() === obs2.content.toLowerCase().trim()) {
          // Identical or near-duplicate. Supersede the older one.
          const older = new Date(obs1.createdAt).getTime() <= new Date(obs2.createdAt).getTime() ? obs1 : obs2;
          const newer = older === obs1 ? obs2 : obs1;
          db.setSupersedes(older.id, newer.id, 'sleep_cycle');
          supersededIds.add(older.id);
          supersededList.push({ oldId: older.id, newId: newer.id, reason: 'Duplicate or near-duplicate content' });
          supersededCount++;
        }
      }
    }

    // 2. AI-Assisted Synthesis (if AI provider is active)
    if (provider.name !== 'none') {
      const finalActiveObs = activeObs.filter((o) => !supersededIds.has(o.id));
      if (finalActiveObs.length >= 2) {
        try {
          const contents = finalActiveObs.map((o) => o.content);
          const synthesizedSummary = await synthesizeObservations(contents);

          if (synthesizedSummary && synthesizedSummary.trim() !== '' && synthesizedSummary !== contents.join('\n')) {
            // Create a new synthesized observation
            const newObs = db.addObservation(
              entity.id,
              synthesizedSummary.trim(),
              'synthesis',
              'high',
              1
            );

            // Mark the synthesized ones as superseded by the new consolidated observation
            for (const oldObs of finalActiveObs) {
              db.setSupersedes(oldObs.id, newObs.id, 'sleep_cycle');
              supersededCount++;
            }

            synthesizedList.push({
              entityId: entity.id,
              newObservationId: newObs.id,
              oldObservationIds: finalActiveObs.map((o) => o.id),
            });
            consolidatedCount++;
          }
        } catch (err) {
          console.error(`LLM Synthesis failed for entity ${entity.name}:`, err);
        }
      }
    }
  }

  return {
    purgedCount,
    supersededCount,
    consolidatedCount,
    details: {
      purged: [],
      superseded: supersededList,
      synthesized: synthesizedList,
    },
  };
}
