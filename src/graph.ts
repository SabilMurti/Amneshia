import type { AddObservationInput, CreateEntityInput, CreateRelationInput, Entity, GraphSnapshot, MemoryStats, SearchResult, UpdateObservationInput, ExportTarget } from './types.js';
import { DatabaseLayer } from './database.js';
import { exportToMarkdown } from './export/markdown.js';
import { getAIProvider } from './ai/index.js';

export interface ExportTargetActionInput {
  action: 'list' | 'add' | 'remove' | 'toggle';
  name?: string;
  path?: string;
  format?: string;
  id?: string;
  autoExport?: boolean;
}

export interface SearchMemoryResult {
  query: string;
  limit: number;
  results: SearchResult[];
}

export interface ExportMemoryResult {
  exported: number;
  targets: ExportTarget[];
}

export class KnowledgeGraph {
  constructor(private readonly database: DatabaseLayer) {}

  createEntities(inputs: CreateEntityInput[]): Entity[] {
    const created: Entity[] = [];
    for (const input of inputs) {
      const existing = this.database.getEntityByName(input.name);
      if (existing) {
        continue;
      }
      created.push(this.database.createEntity(input));
    }
    this.triggerAutoExport();
    return created;
  }

  createRelations(inputs: CreateRelationInput[]): Array<{ relation: string }> {
    const created: Array<{ relation: string }> = [];
    for (const input of inputs) {
      const fromEntity = this.database.getEntityByName(input.from);
      const toEntity = this.database.getEntityByName(input.to);
      if (!fromEntity || !toEntity) {
        continue;
      }
      const rel = this.database.createRelation(fromEntity.id, toEntity.id, input.relationType);
      created.push({ relation: rel.id });
    }
    this.triggerAutoExport();
    return created;
  }

  async addObservations(inputs: AddObservationInput[]): Promise<Array<{ entityName: string; observationIds: string[] }>> {
    const created: Array<{ entityName: string; observationIds: string[] }> = [];
    const provider = getAIProvider();

    for (const input of inputs) {
      const entity = this.database.getEntityByName(input.entityName);
      if (!entity) {
        continue;
      }
      const observationIds: string[] = [];
      let contextObservations: string[] = [];
      if (provider.name !== 'none') {
        contextObservations = this.database.getObservationsByEntity(entity.id).map(o => o.content);
      }

      for (const content of input.contents) {
        let finalContent = content;
        if (provider.name !== 'none') {
          const result = await provider.synthesize(content, contextObservations);
          finalContent = result.content;
          contextObservations.push(finalContent);
        }

        const observation = this.database.addObservation(
          entity.id,
          finalContent,
          input.source,
          input.importance ?? 'normal',
          1,
          input.expiresAt
        );
        observationIds.push(observation.id);
      }
      created.push({ entityName: entity.name, observationIds });
    }
    this.triggerAutoExport();
    return created;
  }

  deleteEntities(names: string[]): number {
    let removed = 0;
    for (const name of names) {
      const entity = this.database.getEntityByName(name);
      if (!entity) continue;
      if (this.database.deleteEntity(entity.id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }

  deleteObservations(ids: string[]): number {
    let removed = 0;
    for (const id of ids) {
      if (this.database.deleteObservation(id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }

  deleteRelations(ids: string[]): number {
    let removed = 0;
    for (const id of ids) {
      if (this.database.deleteRelation(id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }

  updateObservation(input: UpdateObservationInput) {
    const updated = this.database.updateObservation(input.observationId, input.newContent, input.changedBy);
    this.triggerAutoExport();
    return updated;
  }

  searchMemory(query: string, limit = 20, domain?: string): SearchMemoryResult {
    const filtered = this.database.searchFTS(query, limit * 2).filter((result) => (domain ? result.entity.domain === domain : true));
    return {
      query,
      limit,
      results: filtered.slice(0, limit),
    };
  }

  readGraph(domain?: string, entityType?: string): GraphSnapshot {
    return this.database.readGraph(domain, entityType);
  }

  openNodes(names: string[]): GraphSnapshot {
    return this.database.openNodes(names);
  }

  getStats(): MemoryStats {
    return this.database.getStats();
  }

  cleanupExpired(): number {
    return this.database.cleanupExpired();
  }

  exportMemory(): ExportMemoryResult {
    const targets = this.database.getExportTargets();
    return { exported: targets.length, targets };
  }

  manageExportTargets(input: ExportTargetActionInput): ExportTarget[] | ExportTarget | { removed: boolean } | { id: string; autoExport: boolean } {
    if (input.action === 'list') {
      return this.database.getExportTargets();
    }
    if (input.action === 'add') {
      if (!input.name || !input.path) {
        throw new Error('name and path are required when adding an export target');
      }
      const autoExport = input.autoExport !== false ? 1 : 0;
      return this.database.addExportTarget(input.name, input.path, input.format ?? 'markdown', autoExport);
    }
    if (input.action === 'remove') {
      if (!input.id) {
        throw new Error('id is required when removing an export target');
      }
      return { removed: this.database.removeExportTarget(input.id) };
    }
    if (input.action === 'toggle') {
      if (!input.id) {
        throw new Error('id is required when toggling an export target');
      }
      const targets = this.database.getExportTargets();
      const target = targets.find(t => t.id === input.id);
      if (!target) {
        throw new Error(`Export target with id ${input.id} not found`);
      }
      const newAutoExport = !target.autoExport;
      this.database.updateExportTarget(input.id, newAutoExport);
      return { id: input.id, autoExport: newAutoExport };
    }
    throw new Error(`Invalid action: ${input.action}`);
  }

  private triggerAutoExport() {
    exportToMarkdown(this);
  }
}
