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
  
  // Interactive Physics Controls
  const [chargeStrength, setChargeStrength] = useState(-120);
  const [linkDistance, setLinkDistance] = useState(30);
  const [showLabels, setShowLabels] = useState(true);
  
  // Connection Highlighting states
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Selected Node context inspector
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

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

    // 1. Create Entity Node references
    snapshot.entities.forEach((entity) => {
      const entityId = entity.id || entity.name;
      nodesMap.set(entityId, {
        id: entityId,
        name: entity.name,
        entityType: entity.entityType,
        domain: entity.domain,
        visibility: entity.visibility,
        allowedAgents: entity.allowedAgents,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        observations: entity.observations || [],
        relations: entity.relations || [],
        val: 8 + (entity.observations?.length || 0) * 1.5, // size matches complexity/observations count
      });

      // 1.2. Create Observation Nodes
      if (entity.observations) {
        entity.observations.forEach((obs) => {
          const obsId = `obs-${obs.id}`;
          const cleanContent = obs.content.replace(/\s+/g, ' ');
          const truncatedName = cleanContent.length > 25 ? cleanContent.substring(0, 25) + '...' : cleanContent;
          
          nodesMap.set(obsId, {
            id: obsId,
            name: truncatedName,
            entityType: 'observation',
            domain: entity.domain,
            visibility: entity.visibility,
            allowedAgents: entity.allowedAgents,
            createdAt: obs.createdAt || entity.createdAt,
            updatedAt: obs.createdAt || entity.updatedAt,
            observations: [obs],
            relations: [],
            val: 4,
            parentEntityId: entityId,
            fullText: obs.content,
          } as any);

          // 1.3. Connect Entity Node to Observation Node
          links.push({
            source: entityId,
            target: obsId,
            relationType: 'observation',
            id: `link-obs-${obs.id}`,
          });
        });
      }
    });

    // 2. Resolve relationships (Entity-to-Entity)
    snapshot.entities.forEach((entity) => {
      if (!entity.relations) return;
      entity.relations.forEach((rel) => {
        const fromId = rel.fromEntityId || rel.fromEntityName || (rel as any).source;
        const toId = rel.toEntityId || rel.toEntityName || (rel as any).target;
        
        let resolvedFromId = nodesMap.has(fromId) ? fromId : null;
        let resolvedToId = nodesMap.has(toId) ? toId : null;

        if (!resolvedFromId) {
          for (const node of nodesMap.values()) {
            if (node.name === fromId) {
              resolvedFromId = node.id;
              break;
            }
          }
        }
        if (!resolvedToId) {
          for (const node of nodesMap.values()) {
            if (node.name === toId) {
              resolvedToId = node.id;
              break;
            }
          }
        }

        if (resolvedFromId && resolvedToId) {
          const linkId = `${resolvedFromId}-${resolvedToId}-${rel.relationType}`;
          if (!links.some(l => l.id === linkId)) {
            links.push({
              source: resolvedFromId,
              target: resolvedToId,
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

  // Dynamic D3 Force modification via refs
  useEffect(() => {
    if (!fgRef.current) return;
    fgRef.current.d3Force('charge')?.strength(chargeStrength);
    fgRef.current.d3Force('link')?.distance(linkDistance);
    fgRef.current.d3ReheatSimulation();
  }, [chargeStrength, linkDistance, graphData]);

  // Highlighting neighborhood calculation
  const { highlightNodes, highlightLinks } = useMemo(() => {
    const nodes = new Set<string>();
    const links = new Set<string>();
    if (hoveredNode) {
      nodes.add(hoveredNode.id);
      graphData.links.forEach((link) => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
        if (sourceId === hoveredNode.id) {
          nodes.add(targetId);
          links.add(link.id);
        } else if (targetId === hoveredNode.id) {
          nodes.add(sourceId);
          links.add(link.id);
        }
      });
    }
    return { highlightNodes: nodes, highlightLinks: links };
  }, [hoveredNode, graphData]);

  // Color mapping based on entity type for aesthetic consistency
  const getNodeColor = (type: string) => {
    const cleanType = type.toLowerCase();
    if (cleanType === 'observation') return '#38bdf8'; // neon cyan
    if (cleanType.includes('person') || cleanType.includes('user')) return '#f59e0b'; // amber accent
    if (cleanType.includes('server') || cleanType.includes('service') || cleanType.includes('host')) return '#3b82f6'; // blue
    if (cleanType.includes('project') || cleanType.includes('repo') || cleanType.includes('code')) return '#10b981'; // green
    if (cleanType.includes('config') || cleanType.includes('setting')) return '#8b5cf6'; // purple
    if (cleanType.includes('credential') || cleanType.includes('token') || cleanType.includes('auth')) return '#ef4444'; // red
    return '#a1a1aa'; // zinc
  };

  const getRelationColor = (relType: string) => {
    const cleanRel = relType.toLowerCase();
    if (cleanRel.includes('work') || cleanRel.includes('dev')) return '#10b981'; // emerald green
    if (cleanRel.includes('use') || cleanRel.includes('run')) return '#3b82f6'; // blue
    if (cleanRel.includes('own') || cleanRel.includes('create')) return '#f59e0b'; // amber
    if (cleanRel.includes('member') || cleanRel.includes('live')) return '#8b5cf6'; // purple
    if (cleanRel.includes('auth') || cleanRel.includes('pass') || cleanRel.includes('key')) return '#ef4444'; // red
    return '#a1a1aa'; // default zinc
  };

  const handleNodeClick = (node: any) => {
    const nodeObj = node as GraphNode;
    setSelectedNode(nodeObj);

    if (!fgRef.current) return;
    if (is3D) {
      const distance = 60;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        800
      );
    } else {
      fgRef.current.centerAt(node.x, node.y, 800);
      fgRef.current.zoom(3.5, 800);
    }
  };

  const handleNodeHover = (node: any) => {
    setHoveredNode(node as GraphNode | null);
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 h-[calc(100vh-73px)] relative overflow-hidden bg-[#09090b]">
      {/* Visual Canvas Container */}
      <div ref={containerRef} className="flex-1 h-full relative">
        {/* Toggle Mode and Details Bar */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIs3D(!is3D)}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#121215]/95 border border-[#27272a] text-xs font-mono text-zinc-300 hover:text-white hover:border-zinc-500 transition-all select-none shadow-lg"
            >
              {is3D ? <Eye className="w-3.5 h-3.5 text-[#f59e0b]" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-500" />}
              <span>{is3D ? 'Toggle 2D Graph' : 'Toggle 3D Graph'}</span>
            </button>
            
            {searchQuery && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#121215]/95 border border-amber-900/30 text-xs font-mono text-amber-500 shadow-lg">
                <Compass className="w-3.5 h-3.5" />
                <span>Query: "{searchQuery}"</span>
                <button onClick={onClearSearch} className="hover:text-amber-300 ml-1">×</button>
              </div>
            )}
          </div>
        </div>

        {/* Floating Controls Panel */}
        <div className="absolute top-4 right-4 z-10 bg-[#121215]/90 border border-[#27272a] p-4 rounded-lg shadow-xl backdrop-blur-md w-60 font-mono text-[11px] text-zinc-300 space-y-3">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-2 mb-1">
            <span className="font-bold text-white tracking-wider">GRAPH CONTROLS</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Charge Force:</span>
              <span className="text-amber-500 font-bold">{chargeStrength}</span>
            </div>
            <input
              type="range"
              min="-400"
              max="0"
              value={chargeStrength}
              onChange={(e) => setChargeStrength(Number(e.target.value))}
              className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Link Distance:</span>
              <span className="text-amber-500 font-bold">{linkDistance}px</span>
            </div>
            <input
              type="range"
              min="15"
              max="150"
              value={linkDistance}
              onChange={(e) => setLinkDistance(Number(e.target.value))}
              className="w-full accent-amber-500 bg-zinc-800 h-1.5 rounded"
            />
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
            <span>Always Show Labels:</span>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="accent-amber-500 rounded bg-zinc-800 border-[#27272a] w-3.5 h-3.5 cursor-pointer"
            />
          </div>
        </div>

        {/* Color Legend */}
        <div className="absolute bottom-4 left-4 z-10 bg-[#121215]/90 border border-[#27272a] p-3 rounded-lg shadow-lg font-mono text-[10px] text-zinc-400 space-y-2 backdrop-blur-md select-none w-44">
          <div className="font-bold text-zinc-300 border-b border-zinc-800 pb-1 mb-1">ENTITY TYPES</div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]"></span>
            <span>Person / User</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
            <span>Server / Service</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
            <span>Project / Repo</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]"></span>
            <span>Config / Setting</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]"></span>
            <span>Credential / Token</span>
          </div>
          <div className="flex items-center gap-2 border-t border-zinc-800 pt-1.5 mt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]"></span>
            <span>Observation (Fakta)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#a1a1aa]"></span>
            <span>Other</span>
          </div>
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
                ref={fgRef}
                graphData={graphData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="#09090b"
                linkWidth={(link: any) => {
                  const isHighlighted = hoveredNode ? highlightLinks.has(link.id) : false;
                  return isHighlighted ? 3.0 : 1.5;
                }}
                linkColor={(link: any) => {
                  if (link.relationType === 'observation') {
                    return hoveredNode ? (highlightLinks.has(link.id) ? '#38bdf8' : 'rgba(56, 189, 248, 0.05)') : 'rgba(56, 189, 248, 0.2)';
                  }
                  const baseColor = getRelationColor(link.relationType);
                  if (hoveredNode) {
                    return highlightLinks.has(link.id) ? baseColor : 'rgba(39, 39, 42, 0.08)';
                  }
                  return baseColor + 'cc';
                }}
                linkDirectionalArrowLength={3.5}
                linkDirectionalArrowRelPos={1}
                nodeColor={(node: any) => {
                  const isHighlighted = hoveredNode ? highlightNodes.has(node.id) : true;
                  return isHighlighted ? getNodeColor(node.entityType) : 'rgba(161, 161, 170, 0.15)';
                }}
                nodeVal={(node: any) => node.val || 8}
                nodeLabel={(node: any) => node.entityType === 'observation' ? node.fullText : `${node.name} (${node.entityType})`}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                enableNodeDrag={true}
              />
            ) : (
              <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="#09090b"
                linkWidth={(link: any) => {
                  const isHighlighted = hoveredNode ? highlightLinks.has(link.id) : false;
                  return isHighlighted ? 3.0 : 1.5;
                }}
                linkColor={(link: any) => {
                  if (link.relationType === 'observation') {
                    return hoveredNode ? (highlightLinks.has(link.id) ? '#38bdf8' : 'rgba(56, 189, 248, 0.05)') : 'rgba(56, 189, 248, 0.3)';
                  }
                  const baseColor = getRelationColor(link.relationType);
                  if (hoveredNode) {
                    return highlightLinks.has(link.id) ? baseColor : 'rgba(39, 39, 42, 0.15)';
                  }
                  return baseColor + 'cc';
                }}
                linkLineDash={(link: any) => link.relationType === 'observation' ? [2, 2] : null}
                linkDirectionalArrowLength={(link: any) => link.relationType === 'observation' ? 0 : 3.5}
                linkDirectionalArrowRelPos={1}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                enableNodeDrag={true}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                  const label = node.name;
                  const fontSize = 11 / globalScale;
                  ctx.font = `${fontSize}px monospace`;
                  const textWidth = ctx.measureText(label).width;
                  const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

                  const isHighlighted = hoveredNode ? highlightNodes.has(node.id) : false;
                  const isDimmed = hoveredNode && !isHighlighted;
                  const isSelected = selectedNode?.id === node.id;

                  // Draw Node circle backing (draw halo first)
                  const size = Math.sqrt(node.val || 8) * 1.8;
                  if (isSelected || isHighlighted) {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI, false);
                    ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.15)';
                    ctx.fill();
                  }

                  ctx.beginPath();
                  if (node.entityType === 'observation') {
                    ctx.arc(node.x, node.y, size * 0.8, 0, 2 * Math.PI, false); // slightly smaller circle
                  } else {
                    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                  }
                  ctx.fillStyle = isDimmed ? 'rgba(161, 161, 170, 0.15)' : getNodeColor(node.entityType);
                  ctx.fill();

                  // Draw Node label text if always showLabels is checked OR if currently highlighted
                  if (showLabels || isHighlighted) {
                    if (globalScale > 0.8 || isHighlighted) {
                      ctx.fillStyle = isDimmed ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.75)';
                      ctx.fillRect(
                        node.x - bckgDimensions[0] / 2,
                        node.y - size - bckgDimensions[1] - 2,
                        bckgDimensions[0],
                        bckgDimensions[1]
                      );

                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillStyle = isDimmed ? 'rgba(244, 244, 245, 0.2)' : '#f4f4f5';
                      ctx.fillText(label, node.x, node.y - size - bckgDimensions[1] / 2 - 2);
                    }
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
