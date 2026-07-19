import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database.js';
import type { BridgeClientManager } from './client.js';

interface ListProjectsResponse {
  projects?: Array<{
    name: string;
    root_path: string;
    nodes?: number;
    edges?: number;
    git?: {
      branch?: string;
      head_sha?: string;
    };
  }>;
}

function deriveCleanName(projName: string, rootPath: string): string {
  const parts = rootPath.split(/[/\\]/);
  const lastPart = parts[parts.length - 1];
  if (lastPart) return lastPart;
  
  const nameParts = projName.split('-');
  return nameParts[nameParts.length - 1] || projName;
}

function parseListProjectsResponse(raw: unknown): ListProjectsResponse {
  if (Array.isArray(raw)) {
    const textBlock = raw.find(item => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string');
    if (textBlock) {
      try {
        const parsed = JSON.parse(textBlock.text);
        if (parsed && typeof parsed === 'object') {
          return parsed as ListProjectsResponse;
        }
      } catch (e) {
        console.error('Failed to parse textBlock JSON:', e);
      }
    }
  }
  if (raw && typeof raw === 'object') {
    if ('projects' in raw) {
      return raw as ListProjectsResponse;
    }
  }
  return {};
}

export async function syncBridgeMemories(
  graph: KnowledgeGraph,
  db: DatabaseLayer,
  bridgeManager: BridgeClientManager
) {
  const servers = db.getBridgeServers();
  const projectsSynced: string[] = [];
  let observationsAdded = 0;
  let relationsCreated = 0;

  // Ensure baseline entities exist
  graph.createEntities([
    { name: 'Sabil Murti', entityType: 'person', domain: 'personal', visibility: 'public' },
    { name: 'Codebase Memory MCP', entityType: 'tool', domain: 'tool:codebase-memory-mcp', visibility: 'public' }
  ]);

  for (const server of servers) {
    const isCodebaseMemory = 
      server.name === 'codebase-memory-mcp' || 
      server.command.includes('codebase-memory-mcp') ||
      server.args.some(arg => arg.includes('codebase-memory-mcp'));

    if (isCodebaseMemory && server.enabled) {
      try {
        const result = await bridgeManager.callTool(server.id, server.command, server.args, 'list_projects');
        const parsed = parseListProjectsResponse(result);
        
        if (parsed.projects && Array.isArray(parsed.projects)) {
          for (const proj of parsed.projects) {
            const cleanName = deriveCleanName(proj.name, proj.root_path);
            
            // Create the project entity if not exists
            graph.createEntities([{
              name: cleanName,
              entityType: 'project',
              domain: 'project:' + cleanName.toLowerCase(),
              visibility: 'public'
            }]);

            // Clean up existing [Codebase Memory MCP] observations for this entity to prevent duplicates
            const entity = db.getEntityByName(cleanName);
            if (entity) {
              const existingObs = db.getObservationsByEntity(entity.id);
              const idsToDelete = existingObs
                .filter(obs => obs.content.startsWith('[Codebase Memory MCP]'))
                .map(obs => obs.id);
              if (idsToDelete.length > 0) {
                graph.deleteObservations(idsToDelete);
              }
            }

            // Add fresh observations
            const branchName = proj.git?.branch || 'main';
            const headSha = proj.git?.head_sha?.slice(0, 7) || 'latest';
            
            const contents = [
              `[Codebase Memory MCP] Root Path: ${proj.root_path}`,
              `[Codebase Memory MCP] Graph Stats: ${proj.nodes ?? 0} nodes, ${proj.edges ?? 0} edges`,
              `[Codebase Memory MCP] Git Branch: ${branchName} (SHA: ${headSha})`,
              `[Codebase Memory MCP] Dashboard URL: http://localhost:9749`
            ];

            await graph.addObservations([{
              entityName: cleanName,
              contents,
              source: 'codebase-memory-mcp'
            }]);
            
            observationsAdded += contents.length;

            // Create relations
            const rels = graph.createRelations([
              { from: 'Sabil Murti', to: cleanName, relationType: 'works_on' },
              { from: cleanName, to: 'Codebase Memory MCP', relationType: 'indexed_in' }
            ]);

            relationsCreated += rels.length;
            projectsSynced.push(cleanName);
          }
        }
      } catch (error) {
        console.error(`Error syncing codebase-memory-mcp server ${server.name}:`, error);
      }
    }
  }

  return {
    projectsSynced,
    observationsAdded,
    relationsCreated
  };
}
