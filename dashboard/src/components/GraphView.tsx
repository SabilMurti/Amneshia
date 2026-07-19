import React, { useState, useEffect, useRef, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';
import { Eye, EyeOff, Tag, Compass, Calendar, Key, UserCheck, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import type { GraphSnapshot, Observation, RelationWithNames } from '../types';

interface GraphViewProps {
  selectedDomain: string;
  searchQuery: string;
  onClearSearch: () => void;
  refreshTrigger: number;
}

interface GraphNode {
  id: string;
  name: string;
  entityType: string;
  domain: string;
  visibility: string;
  allowedAgents: string[];
  createdAt: string;
  updatedAt: string;
  observations: Observation[];
  relations: RelationWithNames[];
  val?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationType: string;
  id: string;
}

export const GraphView: React.FC<GraphViewProps> = ({
  selectedDomain,
  searchQuery,
  onClearSearch,
  refreshTrigger,
}) => {
  const [is3D, setIs3D] = useState(false);
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Selected Node context inspector
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize listener
  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = () => {
      setDimensions({
        width: containerRef.current?.clientWidth || 800,
        height: (containerRef.current?.clientHeight || 600) - 48,
      });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [containerRef]);

  // Fetch data
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Use query search API if searchQuery is active, else domain graph
      if (searchQuery) {
        const results = await api.search(searchQuery);
        // Map search results back to GraphSnapshot structure
        const entities = results.map(r => ({
          ...r.entity,
          observations: r.observations,
          relations: r.relations,
        }));
        setSnapshot({ entities });
      } else {
        const graphData = await api.getGraph(selectedDomain || undefined);
        setSnapshot(graphData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDomain, searchQuery, refreshTrigger]);

  // Format node graph structure for force graph client libraries
  const graphData = useMemo(() => {
    if (!snapshot) return { nodes: [], links: [] };

    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    // 1. Create Node references
    snapshot.entities.forEach((entity) => {
      nodesMap.set(entity.id, {
        id: entity.id,
        name: entity.name,
        entityType: entity.entityType,
        domain: entity.domain,
        visibility: entity.visibility,
        allowedAgents: entity.allowedAgents,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        observations: entity.observations || [],
        relations: entity.relations || [],
        val: 8 + (entity.observations?.length || 0) * 2, // size matches complexity/observations count
      });
    });

    // 2. Resolve relationships
    snapshot.entities.forEach((entity) => {
      if (!entity.relations) return;
      entity.relations.forEach((rel) => {
        // Only wire relation links where both endpoints exist in filtered graph slice
        if (nodesMap.has(rel.fromEntityId) && nodesMap.has(rel.toEntityId)) {
          // Prevent duplicates
          const linkId = `${rel.fromEntityId}-${rel.toEntityId}-${rel.relationType}`;
          if (!links.some(l => l.id === linkId)) {
            links.push({
              source: rel.fromEntityId,
              target: rel.toEntityId,
              relationType: rel.relationType,
              id: rel.id || linkId,
            });
          }
        }
      });
    });

    return {
      nodes: Array.from(nodesMap.values()),
      links,
    };
  }, [snapshot]);

  // Color mapping based on entity type for aesthetic consistency
  const getNodeColor = (type: string) => {
    const cleanType = type.toLowerCase();
    if (cleanType.includes('person') || cleanType.includes('user')) return '#f59e0b'; // amber accent
    if (cleanType.includes('server') || cleanType.includes('service') || cleanType.includes('host')) return '#3b82f6'; // blue
    if (cleanType.includes('project') || cleanType.includes('repo') || cleanType.includes('code')) return '#10b981'; // green
    if (cleanType.includes('config') || cleanType.includes('setting')) return '#8b5cf6'; // purple
    if (cleanType.includes('credential') || cleanType.includes('token') || cleanType.includes('auth')) return '#ef4444'; // red
    return '#a1a1aa'; // zinc
  };

  const handleNodeClick = (node: any) => {
    // Cast to GraphNode safely
    const nodeObj = node as GraphNode;
    setSelectedNode(nodeObj);
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 h-[calc(100vh-73px)] relative overflow-hidden bg-[#09090b]">
      {/* Visual Canvas Container */}
      <div ref={containerRef} className="flex-1 h-full relative">
        {/* Toggle Mode and Details Bar */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
          <button
            onClick={() => setIs3D(!is3D)}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#121215] border border-[#27272a] text-xs font-mono text-zinc-300 hover:text-white hover:border-zinc-500 transition-all select-none"
          >
            {is3D ? <Eye className="w-3.5 h-3.5 text-[#f59e0b]" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-500" />}
            <span>{is3D ? 'Toggle 2D Graph' : 'Toggle 3D Graph'}</span>
          </button>
          
          {searchQuery && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#121215] border border-amber-900/30 text-xs font-mono text-amber-500">
              <Compass className="w-3.5 h-3.5" />
              <span>Query: "{searchQuery}"</span>
              <button onClick={onClearSearch} className="hover:text-amber-300 ml-1">×</button>
            </div>
          )}
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-3 bg-[#121215] border border-[#27272a] p-6 rounded shadow-xl">
              <span className="w-6 h-6 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin"></span>
              <span className="font-mono text-xs text-zinc-400">Syncing Graph Topology...</span>
            </div>
          </div>
        )}

        {/* Error State Banner */}
        {error && (
          <div className="absolute top-16 left-4 z-10 max-w-md flex items-start gap-3 bg-red-950/20 border border-red-900/30 p-3 rounded font-mono text-xs text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold mb-1">Failed to fetch memory slice</p>
              <p className="text-zinc-500">{error}</p>
            </div>
          </div>
        )}

        {/* Empty State visual */}
        {!isLoading && graphData.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center select-none text-center p-6">
            <Compass className="w-12 h-12 text-zinc-700 mb-3 animate-pulse" />
            <h3 className="font-mono text-sm font-semibold text-zinc-400 mb-1">Empty Memory Universe</h3>
            <p className="font-mono text-xs text-zinc-600 max-w-xs">
              No entity nodes resolved in this domain. Inject fresh memories or observe agent activity to map graph topology.
            </p>
          </div>
        )}

        {/* Render Graph Selection */}
        {graphData.nodes.length > 0 && (
          <div className="w-full h-full force-graph-container">
            {is3D ? (
              <ForceGraph3D
                graphData={graphData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="#09090b"
                linkColor={() => '#27272a'}
                linkWidth={1.5}
                nodeColor={(node: any) => getNodeColor(node.entityType)}
                nodeVal={(node: any) => node.val || 8}
                nodeLabel={(node: any) => `${node.name} (${node.entityType})`}
                onNodeClick={handleNodeClick}
                enableNodeDrag={true}
              />
            ) : (
              <ForceGraph2D
                graphData={graphData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="#09090b"
                linkColor={() => '#27272a'}
                linkWidth={1.5}
                nodeColor={(node: any) => getNodeColor(node.entityType)}
                nodeVal={(node: any) => node.val || 8}
                nodeLabel={(node: any) => `${node.name} (${node.entityType})`}
                onNodeClick={handleNodeClick}
                enableNodeDrag={true}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                  const label = node.name;
                  const fontSize = 11 / globalScale;
                  ctx.font = `${fontSize}px monospace`;
                  const textWidth = ctx.measureText(label).width;
                  const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

                  // Draw Node circle backing
                  const size = Math.sqrt(node.val || 8) * 1.8;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                  ctx.fillStyle = getNodeColor(node.entityType);
                  ctx.fill();

                  // Draw Node label text if zoomed in enough
                  if (globalScale > 0.8) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                    ctx.fillRect(
                      node.x - bckgDimensions[0] / 2,
                      node.y - size - bckgDimensions[1] - 2,
                      bckgDimensions[0],
                      bckgDimensions[1]
                    );

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#f4f4f5';
                    ctx.fillText(label, node.x, node.y - size - bckgDimensions[1] / 2 - 2);
                  }
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Side Panel Node Inspector Details */}
      {selectedNode && (
        <aside className="w-full md:w-96 bg-[#121215] border-t md:border-t-0 md:border-l border-[#27272a] h-full flex flex-col justify-between flex-shrink-0 z-10 overflow-y-auto">
          <div>
            {/* Header Inspector */}
            <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#f59e0b]" />
                <span className="font-mono text-xs uppercase font-bold tracking-wider text-zinc-400">Entity Details</span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-300"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Entity Title & Type Monospace tag */}
              <div>
                <h2 className="text-xl font-bold font-mono text-white mb-2 break-all">{selectedNode.name}</h2>
                <div className="flex flex-wrap gap-2">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-[#27272a] uppercase select-none">
                    {selectedNode.entityType}
                  </span>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/20 text-amber-500 border border-amber-900/30 uppercase select-none">
                    {selectedNode.domain}
                  </span>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-[#27272a] uppercase select-none">
                    {selectedNode.visibility}
                  </span>
                </div>
              </div>

              {/* Allowed Agents */}
              <div className="space-y-2">
                <h4 className="font-mono text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Access Control (Allowed Agents)</span>
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNode.allowedAgents.length === 0 ? (
                    <span className="text-zinc-600 text-xs font-mono">Any agent can access</span>
                  ) : (
                    selectedNode.allowedAgents.map(agent => (
                      <span key={agent} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-950/40 text-zinc-400 border border-[#27272a]">
                        {agent}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Timestamp details */}
              <div className="space-y-1.5 text-[11px] font-mono text-zinc-500 border-t border-zinc-800/50 pt-4">
                <div className="flex justify-between">
                  <span>Registered:</span>
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(selectedNode.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Last Updated:</span>
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Key className="w-3 h-3" />
                    {new Date(selectedNode.updatedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* List of Observations */}
              <div className="space-y-3 pt-2">
                <h3 className="font-mono text-sm font-semibold text-zinc-300">
                  Observations ({selectedNode.observations.length})
                </h3>
                {selectedNode.observations.length === 0 ? (
                  <p className="text-xs font-mono text-zinc-600 italic">No factual observation statements recorded.</p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {selectedNode.observations.map((obs) => (
                      <div key={obs.id} className="p-3 bg-[#09090b] border border-[#27272a] rounded relative text-xs">
                        <p className="font-sans text-zinc-300 leading-relaxed mb-2 break-words">{obs.content}</p>
                        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                          <span className="px-1 py-0.5 bg-zinc-900 border border-[#27272a] rounded select-none text-[9px] text-[#f59e0b]">
                            Imp: {obs.importance}
                          </span>
                          <span>Conf: {obs.confidence}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Node Relationships list */}
              <div className="space-y-3 border-t border-zinc-800/50 pt-4">
                <h3 className="font-mono text-sm font-semibold text-zinc-300">
                  Relations ({selectedNode.relations.length})
                </h3>
                {selectedNode.relations.length === 0 ? (
                  <p className="text-xs font-mono text-zinc-600 italic">No semantic connections established.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedNode.relations.map((rel) => {
                      const isSource = rel.fromEntityId === selectedNode.id;
                      const counterPart = isSource ? rel.toEntityName : rel.fromEntityName;
                      return (
                        <div key={rel.id} className="flex items-center justify-between p-2.5 bg-zinc-950/40 border border-[#27272a] rounded text-xs font-mono">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-zinc-500">{isSource ? 'Out' : 'In'}:</span>
                            <span className="text-zinc-300 font-bold truncate max-w-[120px]">{counterPart}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-[#27272a] text-[10px] select-none">
                            {rel.relationType}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-[#27272a] bg-zinc-950/20 text-center">
            <span className="text-[10px] font-mono text-zinc-600">ID: {selectedNode.id}</span>
          </div>
        </aside>
      )}
    </div>
  );
};
