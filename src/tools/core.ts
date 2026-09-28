import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database/index.js';
import { checkContradiction } from '../consolidation/contradiction.js';
import type { AuthorityTier, ObservationStatus } from '../types.js';

function textContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.8);
}

export function registerCoreTools(
  server: McpServer,
  graph: KnowledgeGraph,
  db: DatabaseLayer
): void {
  // 1. remember: High-level store with auto-upsert and pre-insertion contradiction check
  server.tool(
    'remember',
    'Store knowledge facts for an entity. Automatically creates the entity if missing, detects contradictions with existing facts, sets authority tiers, and records logical dependencies.',
    {
      entity: z.string().min(1).describe('Entity name (e.g. "React Architecture", "Sabil Murti")'),
      facts: z.array(z.string().min(1)).min(1).describe('List of facts/observations to remember'),
      type: z.string().optional().describe('Entity type (default: "concept")'),
      domain: z.string().optional().describe('Domain namespace (default: "personal")'),
      tier: z
        .enum(['invariant', 'architectural', 'contextual', 'ephemeral'])
        .optional()
        .describe(
          'Authority tier: invariant (never decays), architectural (365d), contextual (90d), ephemeral (7d)'
        ),
      derived_from: z
        .array(z.string())
        .optional()
        .describe('Observation IDs that these facts logically depend on (for truth maintenance)'),
    },
    async ({ entity, facts, type, domain, tier, derived_from }) => {
      try {
        let ent = db.getEntityByName(entity);
        if (!ent) {
          ent = db.createEntity({
            name: entity,
            entityType: type ?? 'concept',
            domain: domain ?? 'personal',
          });
        }

        const tierVal: AuthorityTier = tier ?? 'contextual';
        const derivedArr = derived_from ?? [];
        const observationIds: string[] = [];
        const warnings: Array<{ fact: string; reason: string; conflictingId?: string }> = [];

        for (const fact of facts) {
          // Pre-insertion contradiction check
          const conflict = await checkContradiction(fact, ent.id, db, false);
          if (conflict.hasContradiction) {
            warnings.push({
              fact,
              reason: conflict.reason || 'Semantic clash with existing fact',
              conflictingId: conflict.conflictingObservation?.id,
            });
            if (conflict.conflictingObservation) {
              db.recordContradiction(
                'pending',
                conflict.conflictingObservation.id,
                ent.id,
                conflict.reason || 'Polar opposition'
              );
            }
          }

          const obs = db.addObservation(
            ent.id,
            fact,
            'agent',
            'normal',
            1.0,
            undefined,
            tierVal,
            derivedArr
          );
          observationIds.push(obs.id);
        }

        // Trigger Markdown dual-write sync
        const obsList = db.getObservationsByEntity(ent.id);
        const relList = db.getRelationsByEntity(ent.id);
        (graph as any).triggerAutoExport?.();

        return textContent({
          ok: true,
          entity: ent.name,
          domain: ent.domain,
          tier: tierVal,
          observationIds,
          contradictionWarnings: warnings.length > 0 ? warnings : undefined,
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to remember facts',
        });
      }
    }
  );

  // 2. recall: Smart search with token budget and progressive disclosure
  server.tool(
    'recall',
    'Smart memory recall. Searches facts using FTS5 BM25, tracks access for decay scoring, optionally traverses graph neighbors, and enforces a strict token budget.',
    {
      query: z.string().min(1).describe('Query text to search across facts and entities'),
      token_budget: z.number().int().positive().optional().describe('Maximum tokens to return (default: 2000)'),
      domain: z.string().optional().describe('Filter by domain'),
      depth: z
        .number()
        .int()
        .min(0)
        .max(3)
        .optional()
        .describe('Graph expansion depth (0 = flat search, 1+ = multi-hop GraphRAG)'),
    },
    async ({ query, token_budget = 2000, domain, depth = 0 }) => {
      try {
        const rawResults = db.searchFTSRelevant(query, 20);
        const filtered = domain ? rawResults.filter((r) => r.entity.domain === domain) : rawResults;

        const results: Array<{
          entity: string;
          domain: string;
          type: string;
          facts: Array<{ id: string; content: string; tier: string; status: string }>;
        }> = [];

        let currentTokens = 0;
        let truncated = false;

        for (const item of filtered) {
          db.recordAccess(item.entity.id);

          const facts: Array<{ id: string; content: string; tier: string; status: string }> = [];
          for (const obs of item.observations) {
            db.recordAccess(item.entity.id, obs.id);
            const factSummary = `${obs.content} (${obs.authorityTier})`;
            const est = estimateTokens(factSummary);

            if (currentTokens + est > token_budget) {
              truncated = true;
              break;
            }

            currentTokens += est;
            facts.push({
              id: obs.id,
              content: obs.content,
              tier: obs.authorityTier,
              status: obs.status,
            });
          }

          if (facts.length > 0) {
            results.push({
              entity: item.entity.name,
              domain: item.entity.domain,
              type: item.entity.entityType,
              facts,
            });
          }

          if (truncated) break;
        }

        // If depth > 0, include relational context
        let relationalContext: string | undefined;
        if (depth > 0 && currentTokens < token_budget) {
          const contextStr = graph.getContext(query, depth, 5, domain);
          const ctxTokens = estimateTokens(contextStr);
          if (currentTokens + ctxTokens <= token_budget) {
            relationalContext = contextStr;
            currentTokens += ctxTokens;
          }
        }

        return textContent({
          ok: true,
          query,
          tokensEstimated: currentTokens,
          tokenBudget: token_budget,
          truncated,
          results,
          relationalContext,
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to recall memory',
        });
      }
    }
  );

  // 3. forget: Targeted removal with soft/hard delete and cascading invalidation
  server.tool(
    'forget',
    'Forget an entity or specific observation. Supports soft invalidation (status: "invalidated"), hard permanent delete, and cascading invalidation of derived downstream facts.',
    {
      target: z.string().min(1).describe('Entity name OR observation UUID to forget'),
      hard: z.boolean().optional().describe('true = permanent delete from database; false = mark invalidated (default)'),
      cascade: z.boolean().optional().describe('true = also invalidate facts derived from this target (default: true)'),
    },
    async ({ target, hard = false, cascade = true }) => {
      try {
        // Check if target is an observation ID
        const obs = db.getObservationById(target);
        if (obs) {
          let staleCount = 0;
          if (cascade) {
            const cascadeRes = db.cascadeInvalidate(obs.id);
            staleCount = cascadeRes.staleIds.length;
          }

          if (hard) {
            db.deleteObservation(obs.id);
          } else {
            db.setObservationStatus(obs.id, 'invalidated');
          }

          (graph as any).triggerAutoExport?.();
          return textContent({
            ok: true,
            type: 'observation',
            targetId: obs.id,
            mode: hard ? 'hard_delete' : 'invalidated',
            cascadedStaleCount: staleCount,
          });
        }

        // Check if target is an Entity name
        const ent = db.getEntityByName(target);
        if (ent) {
          const obsList = db.getObservationsByEntity(ent.id);
          let staleCount = 0;

          for (const o of obsList) {
            if (cascade) {
              const cascadeRes = db.cascadeInvalidate(o.id);
              staleCount += cascadeRes.staleIds.length;
            }
            if (!hard) {
              db.setObservationStatus(o.id, 'invalidated');
            }
          }

          if (hard) {
            db.deleteEntity(ent.id);
          }

          (graph as any).triggerAutoExport?.();
          return textContent({
            ok: true,
            type: 'entity',
            entity: ent.name,
            observationsAffected: obsList.length,
            mode: hard ? 'hard_delete' : 'invalidated',
            cascadedStaleCount: staleCount,
          });
        }

        return textContent({
          ok: false,
          error: `Target not found: "${target}" is neither an existing entity name nor a known observation ID.`,
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to forget target',
        });
      }
    }
  );

  // 4. context: GraphRAG multi-hop relational retrieval
  server.tool(
    'context',
    'Multi-hop GraphRAG context retrieval. Finds seed entities matching query via FTS5 BM25 and traverses outward N hops, returning compressed relational markdown.',
    {
      query: z.string().min(1).describe('Search query for starting seeds'),
      depth: z.number().int().min(0).max(4).optional().describe('Traversal depth (default: 1)'),
      limit: z.number().int().positive().max(20).optional().describe('Maximum seed entities (default: 5)'),
      domain: z.string().optional().describe('Optional domain filter'),
    },
    async ({ query, depth = 1, limit = 5, domain }) => {
      try {
        const text = graph.getContext(query, depth, limit, domain);
        return textContent(text);
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to retrieve context',
        });
      }
    }
  );
}
