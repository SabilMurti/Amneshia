import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database/index.js';
import { checkContradiction } from '../maintenance/contradiction.js';
import { storeMediaAsset } from '../storage/media-store.js';
import type { AuthorityTier, ObservationStatus } from '../types.js';
import { getCloudStatus, cloudPull, cloudPush, cloudSync } from '../cloud/git-sync.js';

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
    'Store one or more factual observations under an entity in the knowledge graph. Automatically creates the entity if missing, evaluates pre-insertion contradiction detection against existing facts, assigns authority tiers, and records logical dependencies.\n\nWHEN TO USE:\n- Use "remember" to record new knowledge, user preferences, architectural decisions, or verified facts.\n- DO NOT use to invalidate or delete outdated facts — use "forget" instead.\n- DO NOT use to query memory — use "recall" or "context" instead.\n\nCONTRADICTION & RETURN BEHAVIOR:\n- Evaluates semantic opposition. If a contradiction is detected, a warning is returned and recorded in the audit log while persisting the fact.\n- Returns JSON containing { ok: true, entity, domain, tier, observationIds, contradictionWarnings }.',
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
          const conflict = await checkContradiction(fact, ent.id, db);
          if (conflict.hasContradiction) {
            warnings.push({
              fact,
              reason: conflict.reason || 'Semantic clash with existing fact',
              conflictingId: conflict.conflictingObservation?.id,
            });
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

          if (conflict.hasContradiction && conflict.conflictingObservation) {
            db.recordContradiction(
              obs.id,
              conflict.conflictingObservation.id,
              ent.id,
              conflict.reason || 'Polar opposition'
            );
          }
        }

        // Trigger targeted Markdown dual-write sync
        graph.triggerAutoExport(ent.name);
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
    'Search memory observations and facts matching keywords or concepts using SQLite FTS5 BM25. Enforces a strict token budget to prevent context window overflow.\n\nWHEN TO USE:\n- Use "recall" for focused keyword search, retrieving specific past facts, or when under a strict token budget.\n- DO NOT use for exploring structural, multi-hop entity relationships — use "context" instead.\n\nRETURNS:\n- JSON object containing matched entities, facts with authority tiers and statuses, estimated tokens used, and truncation flag.',
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
        const rawResults = await db.searchHybrid(query, { limit: 20, domain });
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
    'Invalidate or permanently remove an entity or a specific observation UUID. Supports soft invalidation, hard permanent deletion, and automatic cascading invalidation of dependent facts.\n\nWHEN TO USE:\n- Use "forget" when a fact is superseded, contradicted, or deprecated.\n- Prefers soft invalidation (hard=false) to preserve audit trails. Use hard=true only when permanently expunging sensitive data.\n- DO NOT use to update a fact with new info — use "remember" with updated content.\n\nPERMISSIONS & FAILURE BEHAVIOR:\n- Operates locally on SQLite storage. Returns an error if the target entity name or UUID is not found in the database.\n- Returns JSON containing { ok: true, type, targetId/entity, mode, cascadedStaleCount }.',
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

          const obsEntity = db.getEntityById(obs.entityId);
          graph.triggerAutoExport(obsEntity?.name);
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
            graph.deleteEntities([ent.name]);
          } else {
            graph.triggerAutoExport(ent.name);
          }
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
    'Traverse the knowledge graph starting from query seed entities outward up to N hops using GraphRAG relational discovery.\n\nWHEN TO USE:\n- Use "context" when you need holistic, multi-hop relational knowledge around an entity (e.g. architecture, connections, dependencies).\n- DO NOT use for simple keyword search or strict token-budget lookups — use "recall" instead.\n\nRETURNS:\n- Formatted relational Markdown document detailing seed entities, their attributes, active observations, and outward relation links.',
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

  // 5. remember_media: Content-Addressable Storage media ingestion with attached facts and relations
  server.tool(
    'remember_media',
    'Ingest an immutable media asset (image, audio, video, PDF, document) into Content-Addressable Storage (CAS) with SHA-256 deduplication. Automatically creates an entity representing the media, records descriptive observations about what the media depicts or contains, evaluates pre-insertion contradiction detection, establishes semantic relations to other entities, and synchronizes to dual-write Markdown.\n\nWHEN TO USE:\n- Use "remember_media" when you have a local media file (screenshot, photo, voice note, document, diagram) and want to attach structured knowledge, descriptions, or relationships to it.\n- Amneshia handles storage, hashing, and relations deterministically with ZERO LLM overhead.\n- To query media facts later, use "recall" or "context".\n\nRETURNS:\n- JSON containing { ok: true, entity, media: { sha256, mimeType, fileName, fileSize, relativePath, deduplicated }, observationIds, relations, contradictionWarnings }.',
    {
      filePath: z.string().min(1).describe('Absolute or workspace-relative path to the source media file on disk'),
      entity: z.string().min(1).describe('Entity name representing this media item (e.g. "Sabil Murti Profile Picture", "Architecture Diagram v3")'),
      domain: z.string().optional().describe('Domain namespace (default: "personal")'),
      facts: z.array(z.string().min(1)).min(1).describe('Factual observations describing the media content, context, or visual elements'),
      tier: z
        .enum(['invariant', 'architectural', 'contextual', 'ephemeral'])
        .optional()
        .describe('Authority tier for attached observations: invariant, architectural, contextual, ephemeral'),
      relations: z
        .array(
          z.object({
            to: z.string().min(1).describe('Target entity name to relate to'),
            relationType: z.string().min(1).describe('Directed relationship type (e.g. "depicts", "belongs_to", "references")'),
          })
        )
        .optional()
        .describe('Semantic relationships linking this media entity to other entities'),
    },
    async ({ filePath, entity, domain, facts, tier, relations }) => {
      try {
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
        const storageRoot = (graph as any).getStorageRoot ? (graph as any).getStorageRoot() : db.getDataDir();
        const stored = await storeMediaAsset(resolvedPath, storageRoot);

        let ent = db.getEntityByName(entity);
        if (!ent) {
          ent = db.createEntity({
            name: entity,
            entityType: 'media',
            domain: domain ?? 'personal',
          });
        }

        let mediaAsset = db.getMediaByEntity(ent.id);
        if (!mediaAsset) {
          mediaAsset = db.createMediaAsset({
            entityId: ent.id,
            sha256: stored.sha256,
            mimeType: stored.mimeType,
            fileName: stored.fileName,
            fileSize: stored.fileSize,
            relativePath: stored.relativePath,
          });
        } else if (mediaAsset.sha256 !== stored.sha256) {
          db.deleteMediaByEntity(ent.id);
          mediaAsset = db.createMediaAsset({
            entityId: ent.id,
            sha256: stored.sha256,
            mimeType: stored.mimeType,
            fileName: stored.fileName,
            fileSize: stored.fileSize,
            relativePath: stored.relativePath,
          });
        }

        const tierVal: AuthorityTier = tier ?? 'contextual';
        const observationIds: string[] = [];
        const warnings: Array<{ fact: string; reason: string; conflictingId?: string }> = [];

        for (const fact of facts) {
          const conflict = await checkContradiction(fact, ent.id, db);
          if (conflict.hasContradiction) {
            warnings.push({
              fact,
              reason: conflict.reason || 'Semantic clash with existing fact',
              conflictingId: conflict.conflictingObservation?.id,
            });
          }

          const obs = db.addObservation(
            ent.id,
            fact,
            'media-ingest',
            'normal',
            1.0,
            undefined,
            tierVal
          );
          observationIds.push(obs.id);

          if (conflict.hasContradiction && conflict.conflictingObservation) {
            db.recordContradiction(
              obs.id,
              conflict.conflictingObservation.id,
              ent.id,
              conflict.reason || 'Polar opposition'
            );
          }
        }

        const relationsCreated: Array<{ to: string; relationType: string }> = [];
        if (relations && relations.length > 0) {
          for (const rel of relations) {
            const targetEnt = db.getEntityByName(rel.to);
            if (targetEnt) {
              db.createRelation(ent.id, targetEnt.id, rel.relationType);
              relationsCreated.push({ to: targetEnt.name, relationType: rel.relationType });
            }
          }
        }

        // Trigger Markdown dual-write sync
        graph.triggerAutoExport(ent.name);
        return textContent({
          ok: true,
          entity: ent.name,
          domain: ent.domain,
          media: {
            id: mediaAsset.id,
            sha256: mediaAsset.sha256,
            mimeType: mediaAsset.mimeType,
            fileName: mediaAsset.fileName,
            fileSize: mediaAsset.fileSize,
            relativePath: mediaAsset.relativePath,
            deduplicated: stored.deduplicated,
          },
          observationIds,
          relations: relationsCreated,
          contradictionWarnings: warnings.length > 0 ? warnings : undefined,
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to remember media',
        });
      }
    }
  );

  // 6. status: Graph statistics, authority tier distribution, and system overview
  server.tool(
    'status',
    'Get high-level summary statistics of the knowledge graph including entity counts, active observations, authority tiers, and open contradictions.\n\nWHEN TO USE:\n- Use "status" to verify memory health, inspect total nodes, or get an architectural overview.\n- Returns JSON with entity counts, observation breakdown by status and tier, and system metrics.',
    {},
    async () => {
      try {
        const stats = graph.getStats();
        const dualWrite = graph.getDualWriteSync();
        const cloud = dualWrite ? await getCloudStatus(dualWrite.getKnowledgeDir()) : null;
        return textContent({
          ok: true,
          stats,
          cloudStatus: cloud,
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to retrieve graph status',
        });
      }
    }
  );

  // 7. reindex: Rebuild SQLite FTS5 index from Markdown-as-Truth files
  server.tool(
    'reindex',
    'Rebuild the SQLite database, FTS5 full-text index, and relational links from the human-readable Markdown directory.\n\nWHEN TO USE:\n- Use "reindex" when Markdown knowledge files were modified externally, pulled from Git, or during disaster recovery.',
    {},
    async () => {
      try {
        const dualWrite = graph.getDualWriteSync();
        if (!dualWrite) {
          return textContent({ ok: false, error: 'Dual-write markdown storage is not active in this session.' });
        }
        const result = dualWrite.reindex();
        return textContent({ ok: true, result });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to reindex from markdown',
        });
      }
    }
  );

  // 8. sync: Bidirectional synchronization with Git cloud remote or dual-write storage
  server.tool(
    'sync',
    'Perform synchronization with Git remote cloud repository or force markdown dual-write export.\n\nWHEN TO USE:\n- Use "sync" to pull or push memories across devices via Git-native sync.\n- Options: "sync" (bidirectional), "pull", "push", or "status".',
    {
      action: z
        .enum(['status', 'push', 'pull', 'sync'])
        .optional()
        .describe('Sync operation: "sync" (bidirectional), "pull", "push", or "status" (default: "sync")'),
      message: z.string().optional().describe('Optional Git commit message when pushing'),
    },
    async ({ action = 'sync', message }) => {
      try {
        const dualWrite = graph.getDualWriteSync();
        if (!dualWrite) {
          return textContent({ ok: false, error: 'Dual-write storage is not initialized.' });
        }
        const knowledgeDir = dualWrite.getKnowledgeDir();

        if (action === 'status') {
          const status = await getCloudStatus(knowledgeDir);
          return textContent({ ok: true, status });
        }
        if (action === 'pull') {
          const pullRes = await cloudPull(knowledgeDir, db);
          return textContent({ ok: true, pull: pullRes });
        }
        if (action === 'push') {
          const pushRes = await cloudPush(knowledgeDir, message);
          return textContent({ ok: true, push: pushRes });
        }

        const syncRes = await cloudSync(knowledgeDir, db, message);
        return textContent({ ok: true, sync: syncRes });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : 'Sync operation failed',
        });
      }
    }
  );
}
