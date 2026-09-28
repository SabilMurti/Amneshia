import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import {
  Eye, EyeOff, Tag, Compass, Calendar, Key, UserCheck, AlertTriangle,
  RotateCw, Maximize2, Sliders, X, ArrowUpRight,
  Sparkles
} from 'lucide-react';
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
  parentEntityId?: string;
  fullText?: string;
  x?: number;
  y?: number;
  z?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relationType: string;
  id: string;
}

// Color palette calibrated for Amneshia v3.0 Deep Amethyst & Electric Violet theme
export const NODE_TYPE_COLORS: Record<string, string> = {
  person: '#c084fc',       // Light Amethyst
  user: '#c084fc',
  server: '#6366f1',       // Indigo
  service: '#6366f1',
  project: '#8b5cf6',      // Electric Purple
  repo: '#8b5cf6',
  code: '#8b5cf6',
  config: '#d946ef',       // Fuchsia
  setting: '#d946ef',
  credential: '#f43f5e',   // Rose
  token: '#f43f5e',
  auth: '#f43f5e',
  observation: '#a855f7',  // Electric Violet
  default: '#94a3b8',      // Slate
};

export const getNodeColor = (type: string): string => {
  const clean = type.toLowerCase();
  for (const [key, color] of Object.entries(NODE_TYPE_COLORS)) {
    if (key !== 'default' && clean.includes(key)) return color;
  }
  return NODE_TYPE_COLORS.default;
};

export const getRelationColor = (relType: string): string => {
  const clean = relType.toLowerCase();
  if (clean.includes('work') || clean.includes('dev')) return '#8b5cf6';
  if (clean.includes('use') || clean.includes('run')) return '#6366f1';
  if (clean.includes('own') || clean.includes('create')) return '#c084fc';
  if (clean.includes('member') || clean.includes('live')) return '#d946ef';
  if (clean.includes('auth') || clean.includes('pass') || clean.includes('key')) return '#f43f5e';
  return '#7c3aed';
};

// Canvas text sprite generator for 3D billboard labels
const createSpriteLabel = (text: string, subtext?: string, color: string = '#c084fc'): THREE.Sprite => {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.imageSmoothingEnabled = true;

    // Glowing container pill
    ctx.fillStyle = 'rgba(9, 7, 20, 0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    
    // Draw rounded rect
    const x = 8, y = 8, w = 304, h = 80, r = 16;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Primary Text
    ctx.font = 'bold 24px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const truncated = text.length > 18 ? text.slice(0, 16) + '…' : text;
    ctx.fillText(truncated, 160, subtext ? 36 : 48);

    // Subtext Tag
    if (subtext) {
      ctx.font = '600 15px "JetBrains Mono", monospace';
      ctx.fillStyle = color;
      ctx.fillText(subtext.toUpperCase(), 160, 64);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(32, 9.6, 1);
  sprite.position.set(0, 10, 0);
  return sprite;
};

export const GraphView: React.FC<GraphViewProps> = ({
  selectedDomain,
  searchQuery,
  onClearSearch,
  refreshTrigger,
}) => {
  const [is3D, setIs3D] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Physics HUD & Layout controls
  const [chargeStrength, setChargeStrength] = useState(-90);
  const [linkDistance, setLinkDistance] = useState(45);
  const [showLabels, setShowLabels] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Connection Highlighting & Selection states
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'observations' | 'relations'>('overview');

  // Container sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 700 });
  const fgRef = useRef<any>(null);

  // ResizeObserver for reliable dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };

    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(containerRef.current);
    window.addEventListener('resize', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Fetch graph slice
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (searchQuery) {
        const results = await api.search(searchQuery);
        const entities = results.map(r => ({
          ...r.entity,
          observations: r.observations,
          relations: (r.relations || []) as any,
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

  // Format node graph structure
  const graphData = useMemo(() => {
    if (!snapshot) return { nodes: [], links: [] };

    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    // 1. Create Entity Nodes
    snapshot.entities.forEach((entity) => {
      const entityId = entity.id || entity.name;
      nodesMap.set(entityId, {
        id: entityId,
        name: entity.name,
        entityType: entity.entityType,
        domain: entity.domain,
        visibility: entity.visibility,
        allowedAgents: entity.allowedAgents || [],
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        observations: entity.observations || [],
        relations: entity.relations || [],
        val: 9 + (entity.observations?.length || 0) * 1.5,
      });

      // 1.2 Observation Nodes (linked to parent entity)
      if (entity.observations) {
        entity.observations.forEach((obs) => {
          const obsId = `obs-${obs.id}`;
          const clean = obs.content.replace(/\s+/g, ' ');
          const shortName = clean.length > 28 ? clean.substring(0, 28) + '…' : clean;

          nodesMap.set(obsId, {
            id: obsId,
            name: shortName,
            entityType: 'observation',
            domain: entity.domain,
            visibility: entity.visibility,
            allowedAgents: entity.allowedAgents || [],
            createdAt: obs.createdAt || entity.createdAt,
            updatedAt: obs.createdAt || entity.updatedAt,
            observations: [obs],
            relations: [],
            val: 4,
            parentEntityId: entityId,
            fullText: obs.content,
          });

          links.push({
            source: entityId,
            target: obsId,
            relationType: 'observation',
            id: `link-obs-${obs.id}`,
          });
        });
      }
    });

    // 2. Resolve Entity-to-Entity Relationships
    snapshot.entities.forEach((entity) => {
      if (!entity.relations) return;
      entity.relations.forEach((rel) => {
        const fromId = rel.fromEntityId || rel.fromEntityName || (rel as any).source;
        const toId = rel.toEntityId || rel.toEntityName || (rel as any).target;

        let resolvedFrom = nodesMap.has(fromId) ? fromId : null;
        let resolvedTo = nodesMap.has(toId) ? toId : null;

        if (!resolvedFrom) {
          for (const node of nodesMap.values()) {
            if (node.name === fromId) {
              resolvedFrom = node.id;
              break;
            }
          }
        }
        if (!resolvedTo) {
          for (const node of nodesMap.values()) {
            if (node.name === toId) {
              resolvedTo = node.id;
              break;
            }
          }
        }

        if (resolvedFrom && resolvedTo) {
          const linkId = `${resolvedFrom}-${resolvedTo}-${rel.relationType}`;
          if (!links.some(l => l.id === linkId)) {
            links.push({
              source: resolvedFrom,
              target: resolvedTo,
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

  // Dynamic D3 Force modification
  useEffect(() => {
    if (!fgRef.current) return;
    try {
      fgRef.current.d3Force('charge')?.strength(chargeStrength);
      fgRef.current.d3Force('link')?.distance(linkDistance);
    } catch {
      // safe fallback if layout is settling
    }
  }, [chargeStrength, linkDistance]);

  // Initial camera auto-framing (zoomToFit) once nodes load
  useEffect(() => {
    if (graphData.nodes.length > 0 && fgRef.current) {
      const timer = setTimeout(() => {
        try {
          fgRef.current?.zoomToFit(800, 60);
        } catch {
          // ignore if canvas unmounted
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [graphData.nodes.length, is3D]);

  // Auto-rotation loop
  useEffect(() => {
    if (!autoRotate || !is3D || !fgRef.current) return;
    let angle = 0;
    const distance = 400;
    let animId: number;

    const rotate = () => {
      angle += Math.PI / 1800; // subtle smooth orbit
      if (fgRef.current) {
        fgRef.current.cameraPosition({
          x: distance * Math.sin(angle),
          z: distance * Math.cos(angle),
        });
      }
      animId = requestAnimationFrame(rotate);
    };

    animId = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(animId);
  }, [autoRotate, is3D]);

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

  // Node selection & camera focus
  const handleNodeClick = useCallback((node: any) => {
    const nodeObj = node as GraphNode;
    setSelectedNode(nodeObj);
    setInspectorTab('overview');

    if (!fgRef.current) return;
    if (is3D) {
      const distance = 80;
      const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
      fgRef.current.cameraPosition(
        { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
        node,
        800
      );
    } else {
      fgRef.current.centerAt(node.x, node.y, 800);
      fgRef.current.zoom(3.0, 800);
    }
  }, [is3D]);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node as GraphNode | null);
  }, []);

  // Camera presets
  const handleResetCamera = () => {
    if (!fgRef.current) return;
    if (is3D) {
      fgRef.current.cameraPosition({ x: 0, y: 0, z: 380 }, { x: 0, y: 0, z: 0 }, 800);
    } else {
      fgRef.current.centerAt(0, 0, 800);
      fgRef.current.zoom(1, 800);
    }
  };

  const handleFitView = () => {
    if (!fgRef.current) return;
    fgRef.current.zoomToFit(800, 50);
  };

  const handleTopView = () => {
    if (!fgRef.current || !is3D) return;
    fgRef.current.cameraPosition({ x: 0, y: 480, z: 0 }, { x: 0, y: 0, z: 0 }, 800);
  };

  const handleIsometricView = () => {
    if (!fgRef.current || !is3D) return;
    fgRef.current.cameraPosition({ x: 260, y: 260, z: 260 }, { x: 0, y: 0, z: 0 }, 800);
  };


  // 3D Object Factory memoized
  const createThreeNode = useCallback((node: unknown) => {
    const n = node as GraphNode;
    const isObs = n.entityType === 'observation';
    const color = isObs ? '#a855f7' : getNodeColor(n.entityType);
    const isHighlighted = hoveredNode ? highlightNodes.has(n.id) : true;
    const isSelected = selectedNode?.id === n.id;
    const baseVal = n.val || (isObs ? 4 : 8);
    const radius = Math.sqrt(baseVal) * (isObs ? 1.2 : 1.8);

    const group = new THREE.Group();
    (group as any).__data = n;

    if (isObs) {
      // Glowing electric violet sphere for facts/observations
      const geometry = new THREE.SphereGeometry(radius, 16, 16);
      const material = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: isHighlighted ? 0.8 : 0.25,
        shininess: 90,
        transparent: true,
        opacity: isHighlighted ? 0.95 : 0.25,
      });
      const mesh = new THREE.Mesh(geometry, material);
      (mesh as any).__data = n;
      group.add(mesh);

      // Label sprite if hovered or selected
      if (hoveredNode?.id === n.id || isSelected) {
        const sprite = createSpriteLabel(n.name, 'FACT', '#c084fc');
        group.add(sprite);
      }
    } else {
      // Multi-faceted geometric crystal for Entities
      const geometry = new THREE.IcosahedronGeometry(radius, 1);
      const material = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: isHighlighted ? (isSelected ? 0.95 : 0.55) : 0.18,
        shininess: 95,
        transparent: true,
        opacity: isHighlighted ? 0.94 : 0.2,
      });
      const mesh = new THREE.Mesh(geometry, material);
      (mesh as any).__data = n;
      group.add(mesh);

      // Glowing outer wireframe halo
      const wireframeGeo = new THREE.EdgesGeometry(geometry);
      const wireframeMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0xd946ef : 0x8b5cf6,
        transparent: true,
        opacity: isHighlighted ? 0.55 : 0.12,
      });
      const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
      group.add(wireframe);

      // Floating billboard text tag
      if (showLabels || isHighlighted || isSelected) {
        const sprite = createSpriteLabel(n.name, n.entityType, color);
        group.add(sprite);
      }
    }

    return group;
  }, [hoveredNode, highlightNodes, selectedNode, showLabels]);

  return (
    <div className="flex flex-col md:flex-row flex-1 h-[calc(100vh-73px)] relative overflow-hidden bg-[#06050b] select-none">
      {/* Visual Canvas Container */}
      <div ref={containerRef} className="flex-1 h-full relative">
        {/* Top Control Bar HUD */}
        <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2.5">
          {/* 3D / 2D Segmented Pill */}
          <div className="flex items-center p-1 rounded-xl bg-[#090714]/80 backdrop-blur-xl border border-purple-500/20 shadow-glow-purple">
            <button
              onClick={() => setIs3D(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                is3D
                  ? 'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-glow-purple'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>3D Universe</span>
            </button>
            <button
              onClick={() => setIs3D(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !is3D
                  ? 'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-glow-purple'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>2D Topology</span>
            </button>
          </div>

          {/* Camera Controls Dock */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#090714]/80 backdrop-blur-xl border border-purple-500/20 shadow-glow-purple">
            <button
              onClick={handleFitView}
              title="Fit Graph to Viewport"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            {is3D && (
              <>
                <button
                  onClick={handleIsometricView}
                  title="Isometric Perspective"
                  className="px-2 py-1 rounded-lg text-[11px] font-mono text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  ISO
                </button>
                <button
                  onClick={handleTopView}
                  title="Top-Down Planar View"
                  className="px-2 py-1 rounded-lg text-[11px] font-mono text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  TOP
                </button>
                <button
                  onClick={() => setAutoRotate(!autoRotate)}
                  title="Toggle Gentle Orbit"
                  className={`p-1.5 rounded-lg transition-all ${
                    autoRotate ? 'text-purple-300 bg-purple-500/20' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
            <button
              onClick={handleResetCamera}
              title="Reset Camera Center"
              className="px-2 py-1 rounded-lg text-[11px] font-mono text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
            >
              RESET
            </button>
          </div>

          {/* Query Filter Active Tag */}
          {searchQuery && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#090714]/80 backdrop-blur-xl border border-purple-500/40 text-xs font-mono text-purple-300 shadow-glow-purple">
              <Compass className="w-3.5 h-3.5" />
              <span>"{searchQuery}"</span>
              <button onClick={onClearSearch} className="hover:text-purple-200 ml-1 font-bold">×</button>
            </div>
          )}

          {/* Toggle HUD button */}
          <button
            onClick={() => setShowControls(!showControls)}
            title="Toggle Physics HUD"
            className={`p-2 rounded-xl bg-[#090714]/80 backdrop-blur-xl border border-purple-500/20 transition-all ${
              showControls ? 'text-purple-300 bg-purple-500/20 shadow-glow-purple' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Floating Physics & Labels HUD */}
        {showControls && (
          <div className="absolute top-4 right-4 z-20 w-64 p-4 rounded-2xl bg-[#090714]/90 backdrop-blur-xl border border-purple-500/25 shadow-glow-purple space-y-3.5 text-xs font-mono text-zinc-300 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
              <span className="font-bold text-white tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                NEURAL PHYSICS
              </span>
              <span className="text-[10px] text-zinc-500">{graphData.nodes.length} nodes</span>
            </div>

            {/* Repulsion Force */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">Repulsion Force:</span>
                <span className="text-purple-300 font-semibold">{chargeStrength}</span>
              </div>
              <input
                type="range"
                min="-300"
                max="-20"
                value={chargeStrength}
                onChange={(e) => setChargeStrength(Number(e.target.value))}
                className="w-full accent-purple-500 bg-purple-950/40 h-1.5 rounded cursor-pointer"
              />
            </div>

            {/* Link Distance */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">Synapse Distance:</span>
                <span className="text-purple-300 font-semibold">{linkDistance}px</span>
              </div>
              <input
                type="range"
                min="20"
                max="120"
                value={linkDistance}
                onChange={(e) => setLinkDistance(Number(e.target.value))}
                className="w-full accent-purple-500 bg-purple-950/40 h-1.5 rounded cursor-pointer"
              />
            </div>

            {/* Labels Toggle */}
            <label className="flex items-center justify-between pt-1 border-t border-purple-500/15 cursor-pointer">
              <span className="text-zinc-400">Permanent Labels:</span>
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="accent-purple-500 rounded bg-zinc-800 border-purple-500/30 w-3.5 h-3.5 cursor-pointer"
              />
            </label>
          </div>
        )}

        {/* Bottom-Left Color Legend Dock */}
        <div className="absolute bottom-4 left-4 z-20 p-3 rounded-xl bg-[#090714]/85 backdrop-blur-xl border border-purple-500/20 text-[11px] font-mono text-zinc-300 space-y-1.5 min-w-[160px] shadow-glow-purple">
          <div className="font-bold text-purple-400/80 text-[10px] tracking-wider uppercase border-b border-purple-500/15 pb-1 mb-1 flex items-center justify-between">
            <span>ONTOLOGY MAP</span>
            <span className="text-zinc-500">{graphData.nodes.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#c084fc] shadow-[0_0_8px_#c084fc]"></span>
              <span>Person</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#6366f1] shadow-[0_0_8px_#6366f1]"></span>
              <span>Service</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8b5cf6] shadow-[0_0_8px_#8b5cf6]"></span>
              <span>Project</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#d946ef] shadow-[0_0_8px_#d946ef]"></span>
              <span>Config</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#f43f5e] shadow-[0_0_8px_#f43f5e]"></span>
              <span>Auth</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#a855f7] shadow-[0_0_8px_#a855f7]"></span>
              <span>Fact</span>
            </div>
          </div>
        </div>

        {/* Error State Banner */}
        {error && (
          <div className="absolute top-16 left-4 z-30 max-w-md flex items-start gap-3 bg-red-950/60 border border-red-500/40 p-3.5 rounded-xl font-mono text-xs text-red-300 backdrop-blur-md">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 flex-shrink-0" />
            <div>
              <p className="font-bold mb-0.5 text-red-200">Failed to load memory snapshot</p>
              <p className="text-red-400/80 text-[11px]">{error}</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && graphData.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-10">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center mb-4 shadow-glow-purple">
              <Compass className="w-8 h-8 text-purple-400 animate-pulse" />
            </div>
            <h3 className="font-sans text-base font-bold text-zinc-200 mb-1">Empty Memory Cosmos</h3>
            <p className="font-mono text-xs text-zinc-500 max-w-sm">
              No entity memories registered in "{selectedDomain || 'all domains'}". Observe agent activity or add entities in the Memories tab.
            </p>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-[#090714]/90 border border-purple-500/25 shadow-glow-purple">
              <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="font-mono text-xs text-purple-200">Synchronizing Graph Topology…</span>
            </div>
          </div>
        )}

        {/* Render Graph Container */}
        {graphData.nodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 && (
          <div className="w-full h-full force-graph-container">
            {is3D ? (
              <ForceGraph3D
                ref={fgRef}
                graphData={graphData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="#06050b"
                nodeThreeObject={createThreeNode}
                nodeThreeObjectExtend={false}
                nodeVal={(node: any) => node.val || 8}
                nodeLabel={(node: any) => node.entityType === 'observation' ? node.fullText : `${node.name} (${node.entityType})`}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                enableNodeDrag={true}
                linkWidth={(link: any) => {
                  const isHighlighted = hoveredNode ? highlightLinks.has(link.id) : false;
                  return isHighlighted ? 2.5 : 1.2;
                }}
                linkColor={(link: any) => {
                  if (link.relationType === 'observation') {
                    return hoveredNode
                      ? (highlightLinks.has(link.id) ? '#a855f7' : 'rgba(168, 85, 247, 0.08)')
                      : 'rgba(168, 85, 247, 0.4)';
                  }
                  const base = getRelationColor(link.relationType);
                  if (hoveredNode) {
                    return highlightLinks.has(link.id) ? base : 'rgba(113, 113, 122, 0.12)';
                  }
                  return base + 'b3';
                }}
                linkDirectionalParticles={2}
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalParticleWidth={(link: any) => highlightLinks.has(link.id) ? 2.5 : 1.5}
                linkDirectionalParticleColor={(link: any) => link.relationType === 'observation' ? '#c084fc' : '#8b5cf6'}
                linkCurvature={0.08}
                d3VelocityDecay={0.3}
                warmupTicks={30}
                cooldownTicks={80}
              />
            ) : (
              <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="#06050b"
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                enableNodeDrag={true}
                linkWidth={(link: any) => {
                  const isHighlighted = hoveredNode ? highlightLinks.has(link.id) : false;
                  return isHighlighted ? 2.8 : 1.2;
                }}
                linkColor={(link: any) => {
                  if (link.relationType === 'observation') {
                    return hoveredNode
                      ? (highlightLinks.has(link.id) ? '#a855f7' : 'rgba(168, 85, 247, 0.08)')
                      : 'rgba(168, 85, 247, 0.45)';
                  }
                  const base = getRelationColor(link.relationType);
                  if (hoveredNode) {
                    return highlightLinks.has(link.id) ? base : 'rgba(113, 113, 122, 0.15)';
                  }
                  return base + 'cc';
                }}
                linkLineDash={(link: any) => link.relationType === 'observation' ? [3, 2] : null}
                linkDirectionalArrowLength={(link: any) => link.relationType === 'observation' ? 0 : 4}
                linkDirectionalArrowRelPos={1}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                  const label = node.name;
                  const isHighlighted = hoveredNode ? highlightNodes.has(node.id) : false;
                  const isDimmed = hoveredNode && !isHighlighted;
                  const isSelected = selectedNode?.id === node.id;
                  const isObs = node.entityType === 'observation';
                  const color = isObs ? '#a855f7' : getNodeColor(node.entityType);

                  const size = Math.sqrt(node.val || 8) * (isObs ? 1.5 : 2.2);

                  // Glowing Halo Ring
                  if (isSelected || isHighlighted) {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI, false);
                    ctx.fillStyle = isSelected ? 'rgba(168, 85, 247, 0.45)' : 'rgba(255, 255, 255, 0.15)';
                    ctx.fill();
                  }

                  // Main Core Node Circle
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                  ctx.fillStyle = isDimmed ? 'rgba(80, 80, 90, 0.2)' : color;
                  ctx.fill();

                  // Crisp Label Pill
                  if (showLabels || isHighlighted || isSelected) {
                    if (globalScale > 0.6 || isHighlighted || isSelected) {
                      const fontSize = Math.max(9, 12 / globalScale);
                      ctx.font = `600 ${fontSize}px "Outfit", system-ui, sans-serif`;
                      const textWidth = ctx.measureText(label).width;
                      const pillW = textWidth + fontSize * 1.2;
                      const pillH = fontSize * 1.5;

                      // Pill background
                      ctx.fillStyle = isDimmed ? 'rgba(9, 7, 20, 0.3)' : 'rgba(9, 7, 20, 0.92)';
                      ctx.strokeStyle = isDimmed ? 'rgba(255, 255, 255, 0.05)' : color;
                      ctx.lineWidth = 1;
                      
                      const px = node.x - pillW / 2;
                      const py = node.y - size - pillH - 4;
                      ctx.beginPath();
                      ctx.roundRect(px, py, pillW, pillH, 6);
                      ctx.fill();
                      ctx.stroke();

                      // Text content
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillStyle = isDimmed ? 'rgba(200, 200, 210, 0.3)' : '#f4f4f6';
                      ctx.fillText(label, node.x, py + pillH / 2);
                    }
                  }
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Slide-Out Inspector Drawer */}
      {selectedNode && (
        <aside className="w-full md:w-96 bg-[#090714]/95 backdrop-blur-2xl border-t md:border-t-0 md:border-l border-purple-500/20 h-full flex flex-col justify-between flex-shrink-0 z-30 animate-in slide-in-from-right-4 duration-300">
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 border-b border-purple-500/20 flex items-center justify-between bg-black/30">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-400" />
                <span className="font-mono text-xs uppercase font-bold tracking-wider text-purple-200">
                  Node Inspector
                </span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs in Inspector */}
            <div className="flex items-center border-b border-purple-500/20 px-4 gap-4 text-xs font-mono bg-black/20">
              <button
                onClick={() => setInspectorTab('overview')}
                className={`py-2.5 font-medium border-b-2 transition-all ${
                  inspectorTab === 'overview'
                    ? 'border-purple-500 text-purple-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setInspectorTab('observations')}
                className={`py-2.5 font-medium border-b-2 transition-all flex items-center gap-1.5 ${
                  inspectorTab === 'observations'
                    ? 'border-purple-500 text-purple-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Facts</span>
                <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 text-[10px]">
                  {(selectedNode.observations || []).length}
                </span>
              </button>
              <button
                onClick={() => setInspectorTab('relations')}
                className={`py-2.5 font-medium border-b-2 transition-all flex items-center gap-1.5 ${
                  inspectorTab === 'relations'
                    ? 'border-purple-500 text-purple-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Links</span>
                <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 text-[10px]">
                  {(selectedNode.relations || []).length}
                </span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {inspectorTab === 'overview' && (
                <>
                  {/* Entity Title & Badges */}
                  <div>
                    <h2 className="text-xl font-bold font-sans text-white mb-2 break-all tracking-tight">
                      {selectedNode.name}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                        {selectedNode.entityType}
                      </span>
                      <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                        {selectedNode.domain}
                      </span>
                      <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-white/10 text-zinc-300 border border-white/10 uppercase">
                        {selectedNode.visibility}
                      </span>
                    </div>
                  </div>

                  {/* Access Control (Allowed Agents) */}
                  <div className="space-y-2 p-3 rounded-xl bg-[#090714] border border-purple-500/15">
                    <h4 className="font-mono text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                      <span>Authorized Agent Scope</span>
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(!selectedNode.allowedAgents || selectedNode.allowedAgents.length === 0) ? (
                        <span className="text-zinc-500 text-xs font-mono">Unrestricted (All agents)</span>
                      ) : (
                        selectedNode.allowedAgents.map((agent) => (
                          <span key={agent} className="font-mono text-[10px] px-2 py-0.5 rounded bg-purple-950/40 text-purple-200 border border-purple-500/25">
                            {agent}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div className="space-y-2 text-[11px] font-mono text-zinc-500 border-t border-purple-500/15 pt-3">
                    <div className="flex justify-between items-center">
                      <span>Registered:</span>
                      <span className="text-zinc-300 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-purple-400/60" />
                        {selectedNode.createdAt ? new Date(selectedNode.createdAt).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Last Mutated:</span>
                      <span className="text-zinc-300 flex items-center gap-1">
                        <Key className="w-3 h-3 text-purple-400/60" />
                        {selectedNode.updatedAt ? new Date(selectedNode.updatedAt).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {inspectorTab === 'observations' && (
                <div className="space-y-3">
                  {(!selectedNode.observations || selectedNode.observations.length === 0) ? (
                    <p className="text-xs font-mono text-zinc-500 italic text-center py-6">
                      No factual observation statements recorded.
                    </p>
                  ) : (
                    selectedNode.observations.map((obs) => (
                      <div key={obs.id} className="p-3.5 rounded-xl bg-[#090714] border border-purple-500/20 space-y-2.5 text-xs">
                        <p className="font-sans text-zinc-200 leading-relaxed break-words">{obs.content}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono border-t border-purple-500/10 pt-2">
                          <div className="flex items-center gap-1.5">
                            {obs.authorityTier && (
                              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase font-bold">
                                {obs.authorityTier}
                              </span>
                            )}
                            {obs.status && (
                              <span className="text-emerald-400">{obs.status}</span>
                            )}
                          </div>
                          <span className="text-zinc-500">Conf: {obs.confidence ?? 1.0}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {inspectorTab === 'relations' && (
                <div className="space-y-2.5">
                  {(!selectedNode.relations || selectedNode.relations.length === 0) ? (
                    <p className="text-xs font-mono text-zinc-500 italic text-center py-6">
                      No semantic connections established.
                    </p>
                  ) : (
                    selectedNode.relations.map((rel) => {
                      const fromIdentifier = rel.fromEntityId || rel.fromEntity || rel.fromEntityName;
                      const isSource = fromIdentifier === selectedNode.id || rel.fromEntityName === selectedNode.name;
                      const counterPart = isSource ? rel.toEntityName : rel.fromEntityName;
                      return (
                        <div
                          key={rel.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-[#090714] border border-purple-500/20 text-xs font-mono hover:border-purple-400 transition-all cursor-pointer"
                          onClick={() => {
                            const counterpartNode = graphData.nodes.find(n => n.name === counterPart);
                            if (counterpartNode) handleNodeClick(counterpartNode);
                          }}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-purple-400/70">{isSource ? 'OUT' : 'IN'}:</span>
                            <span className="text-zinc-200 font-bold truncate max-w-[140px]">{counterPart}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px]">
                            {rel.relationType}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-3 border-t border-purple-500/20 bg-black/40 text-center flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>UUID: {selectedNode.id.slice(0, 16)}…</span>
            <span className="text-purple-400/80">{selectedNode.domain}</span>
          </div>
        </aside>
      )}
    </div>
  );
};

export default GraphView;
