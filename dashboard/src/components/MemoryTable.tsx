import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  FileText,
  AlertTriangle,
  FolderOpen,
  Crown,
  Building2,
  Clock,
  Zap,
  Network,
  GitBranch,
  Compass,
} from 'lucide-react';
import { api } from '../api/client';
import type { GraphSnapshot, Entity, Observation, RelationWithNames, AuthorityTier, ObservationStatus } from '../types';

interface MemoryTableProps {
  selectedDomain: string;
  searchQuery: string;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const MemoryTable: React.FC<MemoryTableProps> = ({
  selectedDomain,
  searchQuery,
  refreshTrigger,
  triggerRefresh,
}) => {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entities & related data
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [selectedEntityObs, setSelectedEntityObs] = useState<Observation[]>([]);
  const [selectedEntityRels, setSelectedEntityRels] = useState<RelationWithNames[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>('');

  // Modals state
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [showAddObservation, setShowAddObservation] = useState(false);
  const [showAddRelation, setShowAddRelation] = useState(false);

  // Forms state
  const [newEntity, setNewEntity] = useState({ name: '', entityType: 'concept', domain: 'personal', visibility: 'public', allowedAgents: '' });
  const [newObservation, setNewObservation] = useState({
    entityName: '',
    content: '',
    importance: 'normal',
    authorityTier: 'contextual' as AuthorityTier,
    derivedFrom: '',
    expiresAt: '',
  });
  const [newRelation, setNewRelation] = useState({ from: '', to: '', relationType: 'relates_to' });

  // Inline edit state
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editingObsContent, setEditingObsContent] = useState('');
  const [editingObsTier, setEditingObsTier] = useState<AuthorityTier>('contextual');
  const [editingObsStatus, setEditingObsStatus] = useState<ObservationStatus>('active');

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (searchQuery) {
        const results = await api.search(searchQuery);
        const entities = results.map((r) => ({
          ...r.entity,
          observations: r.observations,
          relations: (r.relations || []) as any,
        }));
        setSnapshot({ entities });
      } else {
        const data = await api.getGraph(selectedDomain || undefined);
        setSnapshot(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDomain, searchQuery, refreshTrigger]);

  useEffect(() => {
    if (!selectedEntity || !snapshot) return;
    const fresh = snapshot.entities.find((e) => e.id === selectedEntity.id);
    if (fresh) {
      setSelectedEntity(fresh);
      setSelectedEntityObs(fresh.observations || []);
      setSelectedEntityRels(fresh.relations || []);
    } else {
      setSelectedEntity(null);
      setSelectedEntityObs([]);
      setSelectedEntityRels([]);
    }
  }, [snapshot]);

  const selectEntity = (entity: Entity) => {
    setSelectedEntity(entity);
    const item = snapshot?.entities.find((e) => e.id === entity.id);
    setSelectedEntityObs(item?.observations || []);
    setSelectedEntityRels(item?.relations || []);
  };

  const handleAddEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntity.name.trim()) return;
    try {
      const allowedAgentsArr = newEntity.allowedAgents.split(',').map((s) => s.trim()).filter(Boolean);
      await api.createEntities([
        {
          name: newEntity.name.trim(),
          entityType: newEntity.entityType.trim(),
          domain: newEntity.domain.trim() || 'personal',
          visibility: newEntity.visibility,
          allowedAgents: allowedAgentsArr,
        },
      ]);
      setShowAddEntity(false);
      setNewEntity({ name: '', entityType: 'concept', domain: 'personal', visibility: 'public', allowedAgents: '' });
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteEntity = async (name: string) => {
    if (!confirm(`Are you sure you want to delete entity "${name}" and all its observations?`)) return;
    try {
      await api.deleteEntities([name]);
      if (selectedEntity?.name === name) {
        setSelectedEntity(null);
      }
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetName = newObservation.entityName || selectedEntity?.name;
    if (!targetName || !newObservation.content.trim()) return;

    try {
      const derivedArr = newObservation.derivedFrom
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await api.addObservations([
        {
          entityName: targetName,
          contents: [newObservation.content.trim()],
          importance: newObservation.importance,
          authorityTier: newObservation.authorityTier,
          derivedFrom: derivedArr,
          expiresAt: newObservation.expiresAt || null,
        },
      ]);
      setShowAddObservation(false);
      setNewObservation({
        entityName: '',
        content: '',
        importance: 'normal',
        authorityTier: 'contextual',
        derivedFrom: '',
        expiresAt: '',
      });
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdateObservation = async (obsId: string) => {
    if (!editingObsContent.trim()) return;
    try {
      await api.updateObservation(
        obsId,
        editingObsContent.trim(),
        'dashboard',
        editingObsTier,
        editingObsStatus
      );
      setEditingObsId(null);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteObservation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this observation?')) return;
    try {
      await api.deleteObservations([id]);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelation.from.trim() || !newRelation.to.trim() || !newRelation.relationType.trim()) return;
    try {
      await api.createRelations([
        {
          from: newRelation.from.trim(),
          to: newRelation.to.trim(),
          relationType: newRelation.relationType.trim(),
        },
      ]);
      setShowAddRelation(false);
      setNewRelation({ from: '', to: '', relationType: 'relates_to' });
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteRelation = async (id: string) => {
    try {
      await api.deleteRelations([id]);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Helper renderers for Authority Tiers
  const renderTierBadge = (tier: AuthorityTier) => {
    switch (tier) {
      case 'invariant':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Crown className="w-2.5 h-2.5 text-amber-400" />
            <span>INVARIANT</span>
          </span>
        );
      case 'architectural':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Building2 className="w-2.5 h-2.5 text-purple-400" />
            <span>ARCHITECTURAL</span>
          </span>
        );
      case 'contextual':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <Clock className="w-2.5 h-2.5 text-emerald-400" />
            <span>CONTEXTUAL</span>
          </span>
        );
      case 'ephemeral':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <Zap className="w-2.5 h-2.5 text-rose-400" />
            <span>EPHEMERAL</span>
          </span>
        );
      default:
        return null;
    }
  };

  const renderStatusBadge = (status: ObservationStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>active</span>
          </span>
        );
      case 'stale':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>stale</span>
          </span>
        );
      case 'invalidated':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-mono line-through">
            invalidated
          </span>
        );
      case 'superseded':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] font-mono">
            superseded
          </span>
        );
      case 'decayed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-purple-950/40 text-purple-400/60 border border-purple-500/20 text-[10px] font-mono">
            decayed
          </span>
        );
      default:
        return null;
    }
  };

  const entitiesList = (snapshot?.entities || []).filter((e) =>
    entityFilter ? e.name.toLowerCase().includes(entityFilter.toLowerCase()) || e.domain.toLowerCase().includes(entityFilter.toLowerCase()) : true
  );

  return (
    <div className="w-full h-full flex flex-col md:flex-row overflow-hidden bg-[#070510]">
      {/* Left Master Column: Entities List */}
      <div className="w-full md:w-80 lg:w-96 border-r border-purple-500/15 flex flex-col h-full bg-[#090714]/90 backdrop-blur-xl">
        <div className="p-4 border-b border-purple-500/15 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-purple-400" />
              <h2 className="font-sans text-sm font-bold text-white">Entities</h2>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">
                {entitiesList.length}
              </span>
            </div>

            <button
              onClick={() => setShowAddEntity(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-[11px] font-bold transition-all shadow-glow-purple"
            >
              <Plus className="w-3 h-3" />
              <span>Entity</span>
            </button>
          </div>

          <input
            type="text"
            placeholder="Filter entities by name or domain…"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-full bg-[#120f26]/80 border border-purple-500/20 rounded-xl px-3 py-1.5 text-xs font-mono text-purple-100 placeholder-purple-400/40 focus:outline-none focus:border-purple-400"
          />

          {error && (
            <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px] font-mono flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-rose-400" />
              <span className="truncate">{error}</span>
            </div>
          )}
        </div>

        {/* Entities Scrollable List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {isLoading && entitiesList.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-500">Loading knowledge graph…</div>
          ) : entitiesList.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-500">No matching entities found.</div>
          ) : (
            entitiesList.map((ent) => {
              const isSelected = selectedEntity?.id === ent.id;
              const obsCount = ent.observations?.length || 0;

              return (
                <div
                  key={ent.id}
                  onClick={() => selectEntity(ent)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none group ${
                    isSelected
                      ? 'bg-purple-600/20 border-purple-500/40 shadow-glow-purple text-white'
                      : 'bg-[#0f0c24]/50 border-purple-500/10 hover:border-purple-500/30 hover:bg-purple-950/20 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-sans font-bold text-xs truncate text-white">{ent.name}</div>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 flex-shrink-0">
                      {obsCount} fact{obsCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-purple-400/70">
                    <span className="px-1.5 py-0.2 rounded bg-white/5 border border-white/5">{ent.domain}</span>
                    <span>•</span>
                    <span className="text-zinc-500">{ent.entityType}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Detail Column: Selected Entity Inspector */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#06050b]">
        {selectedEntity ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Entity Header Banner */}
            <div className="p-6 border-b border-purple-500/15 bg-[#090714] flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="font-sans text-xl font-extrabold text-white tracking-tight">
                    {selectedEntity.name}
                  </h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                    {selectedEntity.entityType}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
                  <span>Domain: <span className="text-purple-300">{selectedEntity.domain}</span></span>
                  <span>•</span>
                  <span>Created: {new Date(selectedEntity.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setNewObservation((prev) => ({ ...prev, entityName: selectedEntity.name }));
                    setShowAddObservation(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all shadow-glow-purple active:scale-[0.97]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Fact</span>
                </button>

                <button
                  onClick={() => {
                    setNewRelation((prev) => ({ ...prev, from: selectedEntity.name }));
                    setShowAddRelation(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/50 border border-purple-500/30 text-purple-300 font-mono text-xs font-semibold transition-all active:scale-[0.97]"
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>Link Relation</span>
                </button>

                <button
                  onClick={() => handleDeleteEntity(selectedEntity.name)}
                  className="p-2 text-zinc-500 hover:text-rose-400 transition-colors rounded-xl hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                  title="Delete entire entity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Inspector Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Observations Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-purple-500/10 pb-2">
                  <h3 className="font-sans text-sm font-bold text-purple-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span>Knowledge Observations & Facts ({selectedEntityObs.length})</span>
                  </h3>
                </div>

                {selectedEntityObs.length === 0 ? (
                  <div className="p-8 text-center text-xs font-mono text-zinc-500 border border-dashed border-purple-500/20 rounded-2xl">
                    No observations recorded yet. Click "Add Fact" to attach memories.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedEntityObs.map((obs) => {
                      const isEditing = editingObsId === obs.id;

                      return (
                        <div key={obs.id} className="double-bezel-shell">
                          <div className="double-bezel-core p-4 space-y-3">
                            {/* Card Topline: Tier Badge + Status + Metadata */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 text-xs font-mono">
                              <div className="flex items-center gap-2">
                                {renderTierBadge(obs.authorityTier)}
                                {renderStatusBadge(obs.status)}
                              </div>

                              <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                                <span>Accessed: <strong className="text-zinc-300">{obs.accessCount ?? 0}x</strong></span>
                                <span>•</span>
                                <span>ID: <code className="text-purple-300/80">{obs.id.slice(0, 8)}…</code></span>
                              </div>
                            </div>

                            {/* Content or Edit Form */}
                            {isEditing ? (
                              <div className="space-y-3">
                                <textarea
                                  value={editingObsContent}
                                  onChange={(e) => setEditingObsContent(e.target.value)}
                                  className="w-full bg-[#080612] border border-purple-500/30 rounded-xl p-3 text-xs font-mono text-purple-100 focus:outline-none focus:border-purple-400"
                                  rows={3}
                                />
                                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                                  <div className="flex items-center gap-2">
                                    <label className="text-zinc-400 text-[10px]">Tier:</label>
                                    <select
                                      value={editingObsTier}
                                      onChange={(e) => setEditingObsTier(e.target.value as AuthorityTier)}
                                      className="bg-[#080612] border border-purple-500/20 rounded-lg px-2 py-1 text-xs text-white"
                                    >
                                      <option value="invariant">invariant</option>
                                      <option value="architectural">architectural</option>
                                      <option value="contextual">contextual</option>
                                      <option value="ephemeral">ephemeral</option>
                                    </select>

                                    <label className="text-zinc-400 text-[10px] ml-2">Status:</label>
                                    <select
                                      value={editingObsStatus}
                                      onChange={(e) => setEditingObsStatus(e.target.value as ObservationStatus)}
                                      className="bg-[#080612] border border-purple-500/20 rounded-lg px-2 py-1 text-xs text-white"
                                    >
                                      <option value="active">active</option>
                                      <option value="stale">stale</option>
                                      <option value="invalidated">invalidated</option>
                                      <option value="superseded">superseded</option>
                                      <option value="decayed">decayed</option>
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => setEditingObsId(null)}
                                      className="px-3 py-1 rounded-lg text-zinc-400 hover:text-white"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleUpdateObservation(obs.id)}
                                      className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-4">
                                <div
                                  className={`text-xs font-mono leading-relaxed ${
                                    obs.status === 'invalidated' || obs.status === 'superseded'
                                      ? 'text-zinc-500 line-through'
                                      : obs.status === 'stale'
                                      ? 'text-amber-200'
                                      : 'text-zinc-200'
                                  }`}
                                >
                                  {obs.content}
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => {
                                      setEditingObsId(obs.id);
                                      setEditingObsContent(obs.content);
                                      setEditingObsTier(obs.authorityTier);
                                      setEditingObsStatus(obs.status);
                                    }}
                                    className="p-1 text-zinc-500 hover:text-purple-300 transition-colors rounded-lg hover:bg-purple-500/10"
                                    title="Edit observation"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteObservation(obs.id)}
                                    className="p-1 text-zinc-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10"
                                    title="Delete observation"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Provenance DAG Links */}
                            {obs.derivedFrom && obs.derivedFrom.length > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] font-mono text-purple-400/80 bg-purple-950/20 border border-purple-500/15 rounded-lg px-2.5 py-1">
                                <GitBranch className="w-3 h-3 text-purple-400" />
                                <span>Derived from:</span>
                                {obs.derivedFrom.map((id) => (
                                  <span key={id} className="bg-purple-900/40 px-1.5 py-0.2 rounded text-purple-200">
                                    {id.slice(0, 8)}…
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Relations Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-purple-500/10 pb-2">
                  <h3 className="font-sans text-sm font-bold text-indigo-200 flex items-center gap-2">
                    <Network className="w-4 h-4 text-indigo-400" />
                    <span>Knowledge Graph Relations ({selectedEntityRels.length})</span>
                  </h3>
                </div>

                {selectedEntityRels.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-zinc-500 border border-dashed border-purple-500/20 rounded-2xl">
                    No relations connected yet. Click "Link Relation" to connect to other nodes.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {selectedEntityRels.map((rel) => {
                      const isOutgoing = rel.fromEntity === selectedEntity.id;
                      const target = isOutgoing ? rel.toEntityName : rel.fromEntityName;

                      return (
                        <div
                          key={rel.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-[#090714] border border-purple-500/15 text-xs font-mono"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-purple-400 font-bold">{isOutgoing ? '->' : '<-'}</span>
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold text-[10px]">
                              {rel.relationType}
                            </span>
                            <span className="text-white font-bold">{target}</span>
                          </div>

                          <button
                            onClick={() => handleDeleteRelation(rel.id)}
                            className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                            title="Delete relation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-950/30 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Compass className="w-6 h-6" />
            </div>
            <h3 className="font-sans text-base font-bold text-white">Select an Entity</h3>
            <p className="text-xs font-mono text-zinc-400 max-w-sm">
              Click any entity on the left to inspect its observations, authority tiers, truth status,
              and connected relations.
            </p>
          </div>
        )}
      </div>

      {/* Add Entity Modal */}
      {showAddEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="double-bezel-shell max-w-md w-full">
            <div className="double-bezel-core p-6 space-y-4">
              <h3 className="font-sans text-lg font-bold text-white">Add New Entity</h3>
              <form onSubmit={handleAddEntity} className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">Entity Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. React Architecture"
                    value={newEntity.name}
                    onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
                    className="w-full bg-[#080612] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-zinc-400 block mb-1">Entity Type</label>
                    <input
                      type="text"
                      placeholder="e.g. concept, tool, person"
                      value={newEntity.entityType}
                      onChange={(e) => setNewEntity({ ...newEntity, entityType: e.target.value })}
                      className="w-full bg-[#080612] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Domain</label>
                    <input
                      type="text"
                      placeholder="e.g. personal, project:alpha"
                      value={newEntity.domain}
                      onChange={(e) => setNewEntity({ ...newEntity, domain: e.target.value })}
                      className="w-full bg-[#080612] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-purple-500/10">
                  <button
                    type="button"
                    onClick={() => setShowAddEntity(false)}
                    className="px-3 py-1.5 rounded-xl text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-glow-purple"
                  >
                    Create Entity
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Observation Modal */}
      {showAddObservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="double-bezel-shell max-w-lg w-full">
            <div className="double-bezel-core p-6 space-y-4">
              <h3 className="font-sans text-lg font-bold text-white">
                Add Fact to "{newObservation.entityName || selectedEntity?.name}"
              </h3>
              <form onSubmit={handleAddObservation} className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">Fact / Content</label>
                  <textarea
                    required
                    placeholder="Enter verifiable fact, architecture decision, or observation…"
                    value={newObservation.content}
                    onChange={(e) => setNewObservation({ ...newObservation, content: e.target.value })}
                    rows={4}
                    className="w-full bg-[#080612] border border-purple-500/20 rounded-xl p-3 text-white focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-zinc-400 block mb-1">Authority Tier</label>
                    <select
                      value={newObservation.authorityTier}
                      onChange={(e) =>
                        setNewObservation({ ...newObservation, authorityTier: e.target.value as AuthorityTier })
                      }
                      className="w-full bg-[#080612] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400"
                    >
                      <option value="invariant">invariant (Never decays)</option>
                      <option value="architectural">architectural (365d)</option>
                      <option value="contextual">contextual (90d)</option>
                      <option value="ephemeral">ephemeral (7d/expiry)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">Derived From (Optional IDs)</label>
                    <input
                      type="text"
                      placeholder="obs-id1, obs-id2"
                      value={newObservation.derivedFrom}
                      onChange={(e) => setNewObservation({ ...newObservation, derivedFrom: e.target.value })}
                      className="w-full bg-[#080612] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-purple-500/10">
                  <button
                    type="button"
                    onClick={() => setShowAddObservation(false)}
                    className="px-3 py-1.5 rounded-xl text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-glow-purple"
                  >
                    Save Fact
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Relation Modal */}
      {showAddRelation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="double-bezel-shell max-w-md w-full">
            <div className="double-bezel-core p-6 space-y-4">
              <h3 className="font-sans text-lg font-bold text-white">Create Relation</h3>
              <form onSubmit={handleAddRelation} className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">From Entity</label>
                  <input
                    type="text"
                    required
                    value={newRelation.from}
                    onChange={(e) => setNewRelation({ ...newRelation, from: e.target.value })}
                    className="w-full bg-[#080612] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Relation Type</label>
                  <input
                    type="text"
                    required
                    placeholder="uses, depends_on, deployed_on, creator_of"
                    value={newRelation.relationType}
                    onChange={(e) => setNewRelation({ ...newRelation, relationType: e.target.value })}
                    className="w-full bg-[#080612] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">To Entity</label>
                  <input
                    type="text"
                    required
                    placeholder="Target entity name"
                    value={newRelation.to}
                    onChange={(e) => setNewRelation({ ...newRelation, to: e.target.value })}
                    className="w-full bg-[#080612] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-purple-500/10">
                  <button
                    type="button"
                    onClick={() => setShowAddRelation(false)}
                    className="px-3 py-1.5 rounded-xl text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-glow-purple"
                  >
                    Link Relation
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryTable;
