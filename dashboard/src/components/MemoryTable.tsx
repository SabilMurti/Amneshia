import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Edit2, X, FileText, Compass, PlusCircle, AlertTriangle,
  FolderOpen, ArrowUpRight
} from 'lucide-react';
import { api } from '../api/client';
import type { GraphSnapshot, Entity, Observation, RelationWithNames } from '../types';
import { getNodeColor } from './GraphView';

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

  // Modals state
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [showAddObservation, setShowAddObservation] = useState(false);
  const [showAddRelation, setShowAddRelation] = useState(false);

  // Forms state
  const [newEntity, setNewEntity] = useState({ name: '', entityType: 'User', domain: 'main', visibility: 'PRIVATE', allowedAgents: '' });
  const [newObservation, setNewObservation] = useState({ entityName: '', content: '', importance: 'MEDIUM', confidence: '1.0', expiresAt: '' });
  const [newRelation, setNewRelation] = useState({ fromEntityName: '', toEntityName: '', relationType: 'relates_to' });

  // Inline edit state
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editingObsContent, setEditingObsContent] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (searchQuery) {
        const results = await api.search(searchQuery);
        const entities = results.map(r => ({
          ...r.entity,
          observations: r.observations,
          relations: r.relations,
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

  // Keep inspected entity details fresh when dataset refreshes
  useEffect(() => {
    if (!selectedEntity || !snapshot) return;
    const fresh = snapshot.entities.find(e => e.id === selectedEntity.id);
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
    const item = snapshot?.entities.find(e => e.id === entity.id);
    setSelectedEntityObs(item?.observations || []);
    setSelectedEntityRels(item?.relations || []);
  };

  // Add Entity
  const handleAddEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntity.name.trim()) return;
    try {
      const allowedAgentsArr = newEntity.allowedAgents.split(',').map(s => s.trim()).filter(Boolean);
      await api.createEntities([{
        name: newEntity.name,
        entityType: newEntity.entityType,
        domain: newEntity.domain,
        visibility: newEntity.visibility,
        allowedAgents: allowedAgentsArr,
      }]);
      setNewEntity({ name: '', entityType: 'User', domain: 'main', visibility: 'PRIVATE', allowedAgents: '' });
      setShowAddEntity(false);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Delete Entity
  const handleDeleteEntity = async (name: string) => {
    if (!confirm(`Permanently delete entity "${name}"? This cascades to all associated observations and relations.`)) return;
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

  // Add Observation
  const handleAddObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObservation.content.trim()) return;
    const targetEntityName = newObservation.entityName || selectedEntity?.name;
    if (!targetEntityName) return;

    try {
      await api.addObservations([{
        entityName: targetEntityName,
        content: newObservation.content,
        importance: newObservation.importance,
        confidence: parseFloat(newObservation.confidence) || 1.0,
        expiresAt: newObservation.expiresAt ? new Date(newObservation.expiresAt).toISOString() : null,
      }]);
      setNewObservation({ entityName: '', content: '', importance: 'MEDIUM', confidence: '1.0', expiresAt: '' });
      setShowAddObservation(false);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Delete Observation
  const handleDeleteObservation = async (id: string) => {
    if (!confirm('Delete this observation fact?')) return;
    try {
      await api.deleteObservations([id]);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Update Observation
  const handleSaveObservationEdit = async (id: string) => {
    if (!editingObsContent.trim()) return;
    try {
      await api.updateObservation(id, editingObsContent, 'dashboard-user');
      setEditingObsId(null);
      setEditingObsContent('');
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Add Relation
  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    const fromName = newRelation.fromEntityName || selectedEntity?.name;
    if (!fromName || !newRelation.toEntityName.trim()) return;
    try {
      await api.createRelations([{
        fromEntityName: fromName,
        toEntityName: newRelation.toEntityName,
        relationType: newRelation.relationType,
      }]);
      setNewRelation({ fromEntityName: '', toEntityName: '', relationType: 'relates_to' });
      setShowAddRelation(false);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Delete Relation
  const handleDeleteRelation = async (id: string) => {
    if (!confirm('Delete this semantic relation link?')) return;
    try {
      await api.deleteRelations([id]);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-73px)] bg-[#08090c] overflow-hidden select-none">
      {/* List Panel */}
      <div className="flex-1 p-6 border-r border-white/[0.08] flex flex-col overflow-hidden">
        {/* Actions header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div>
            <h2 className="font-sans text-base font-bold text-white tracking-tight flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-amber-400" />
              <span>Entity Directory</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                {snapshot?.entities.length ?? 0}
              </span>
            </h2>
            <p className="font-mono text-[11px] text-zinc-500 mt-0.5">
              Knowledge graph nodes and raw observation memory statements.
            </p>
          </div>
          <button
            onClick={() => setShowAddEntity(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black px-3.5 py-2 rounded-xl font-mono text-xs font-bold shadow-glow-amber transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Entity</span>
          </button>
        </div>

        {/* Loading / Error / Empty States */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center font-mono text-xs text-zinc-500 gap-2">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Fetching entity matrix…</span>
          </div>
        )}

        {error && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center font-mono text-xs text-red-400">
            <AlertTriangle className="w-6 h-6 text-red-500 mb-2" />
            <p>Directory sync failure: {error}</p>
          </div>
        )}

        {!isLoading && snapshot?.entities.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <Compass className="w-10 h-10 text-zinc-700 mb-2 animate-pulse" />
            <span className="font-sans text-sm font-semibold text-zinc-400">No entities registered</span>
            <span className="font-mono text-xs text-zinc-600 mt-1">
              Create an entity above or use an agent observation tool.
            </span>
          </div>
        )}

        {/* Table of Entities */}
        {snapshot && snapshot.entities.length > 0 && (
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="rounded-2xl glass-panel overflow-hidden border border-white/[0.08] shadow-sm">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="bg-black/30 border-b border-white/[0.08] text-zinc-400 select-none">
                    <th className="py-3 px-4 font-semibold">Entity</th>
                    <th className="py-3 px-4 font-semibold">Type</th>
                    <th className="py-3 px-4 font-semibold">Domain</th>
                    <th className="py-3 px-4 font-semibold">Access</th>
                    <th className="py-3 px-4 font-semibold text-center">Facts</th>
                    <th className="py-3 px-4 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {snapshot.entities.map((ent) => {
                    const isInspected = selectedEntity?.id === ent.id;
                    const typeColor = getNodeColor(ent.entityType);
                    return (
                      <tr
                        key={ent.id}
                        onClick={() => selectEntity(ent)}
                        className={`cursor-pointer transition-colors duration-150 ${
                          isInspected
                            ? 'bg-amber-500/10 text-white'
                            : 'hover:bg-white/[0.03] text-zinc-300'
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: typeColor, boxShadow: `0 0 8px ${typeColor}` }}
                          ></span>
                          <span className="truncate max-w-[180px]">{ent.name}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-lg border uppercase"
                            style={{
                              backgroundColor: `${typeColor}15`,
                              color: typeColor,
                              borderColor: `${typeColor}30`,
                            }}
                          >
                            {ent.entityType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-400">{ent.domain}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md ${
                              ent.visibility === 'PUBLIC'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-zinc-800 text-zinc-400 border border-white/5'
                            }`}
                          >
                            {ent.visibility}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center tabular-nums text-zinc-400">
                          {(ent.observations || []).length}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEntity(ent.name);
                            }}
                            className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                            title="Delete entity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Inspector Panel */}
      <div className="w-full md:w-[480px] p-6 flex flex-col justify-between overflow-hidden glass-panel-elevated border-t md:border-t-0 md:border-l border-white/[0.08]">
        {selectedEntity ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-white/10 pb-4 mb-4 flex-shrink-0">
              <div>
                <h3 className="text-xl font-bold font-sans text-white mb-2 break-all tracking-tight">
                  {selectedEntity.name}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase">
                    {selectedEntity.entityType}
                  </span>
                  <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase">
                    {selectedEntity.domain}
                  </span>
                  <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-white/10 text-zinc-300 border border-white/10 uppercase">
                    {selectedEntity.visibility}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedEntity(null)}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Clear
              </button>
            </div>

            {/* Content Lists */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-6">
              {/* Observations */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Observations ({selectedEntityObs.length})</span>
                  </span>
                  <button
                    onClick={() => {
                      setNewObservation({ ...newObservation, entityName: selectedEntity.name });
                      setShowAddObservation(true);
                    }}
                    className="flex items-center gap-1 hover:text-amber-300 font-mono text-xs text-amber-400 transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Add Fact</span>
                  </button>
                </div>

                {selectedEntityObs.length === 0 ? (
                  <p className="text-xs font-mono text-zinc-500 italic p-4 rounded-xl bg-black/30 border border-white/5 text-center">
                    No statements observed.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedEntityObs.map((obs) => (
                      <div
                        key={obs.id}
                        className="p-3.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono group hover:border-zinc-500 transition-all"
                      >
                        {editingObsId === obs.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingObsContent}
                              onChange={(e) => setEditingObsContent(e.target.value)}
                              className="w-full bg-black/60 border border-amber-500/50 rounded-lg p-2 text-zinc-100 focus:outline-none text-xs"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingObsId(null)}
                                className="px-2.5 py-1 text-[11px] rounded bg-white/5 text-zinc-400 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveObservationEdit(obs.id)}
                                className="px-2.5 py-1 text-[11px] rounded bg-amber-500 text-black font-bold hover:bg-amber-400"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="font-sans text-zinc-200 leading-relaxed mb-2 break-words text-xs">
                              {obs.content}
                            </p>
                            <div className="flex justify-between items-center text-[10px] text-zinc-500 border-t border-white/5 pt-2">
                              <div className="flex items-center gap-2">
                                <span className="text-amber-400 font-semibold uppercase">{obs.importance || 'NORMAL'}</span>
                                <span>Conf: {obs.confidence ?? 1}</span>
                              </div>
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingObsId(obs.id);
                                    setEditingObsContent(obs.content);
                                  }}
                                  className="text-zinc-400 hover:text-white p-1"
                                  title="Edit observation"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteObservation(obs.id)}
                                  className="text-zinc-400 hover:text-rose-400 p-1"
                                  title="Delete observation"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Relations */}
              <div className="space-y-3 border-t border-white/10 pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Relations ({selectedEntityRels.length})</span>
                  </span>
                  <button
                    onClick={() => {
                      setNewRelation({ ...newRelation, fromEntityName: selectedEntity.name });
                      setShowAddRelation(true);
                    }}
                    className="flex items-center gap-1 hover:text-cyan-300 font-mono text-xs text-cyan-400 transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Add Link</span>
                  </button>
                </div>

                {selectedEntityRels.length === 0 ? (
                  <p className="text-xs font-mono text-zinc-500 italic p-4 rounded-xl bg-black/30 border border-white/5 text-center">
                    No relations registered.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedEntityRels.map((rel) => {
                      const isSource = rel.fromEntityId === selectedEntity.id;
                      const counterPart = isSource ? rel.toEntityName : rel.fromEntityName;
                      return (
                        <div
                          key={rel.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-mono group"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-zinc-500">{isSource ? 'OUT' : 'IN'}:</span>
                            <span className="text-white font-semibold truncate max-w-[140px]">{counterPart}</span>
                            <span className="text-[10px] text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                              {rel.relationType}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteRelation(rel.id)}
                            className="text-zinc-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
              <FolderOpen className="w-6 h-6 text-zinc-500" />
            </div>
            <p className="font-sans text-sm font-semibold text-zinc-300">Select an entity to inspect</p>
            <p className="font-mono text-xs text-zinc-500 mt-1 max-w-xs">
              View attached factual observations, lineage history, and linked knowledge graph edges.
            </p>
          </div>
        )}

        {/* Footer */}
        {selectedEntity && (
          <div className="pt-3 border-t border-white/10 flex justify-between items-center text-[10px] font-mono text-zinc-500">
            <span>UUID: {selectedEntity.id.slice(0, 16)}…</span>
            <span className="text-zinc-400">{selectedEntity.domain}</span>
          </div>
        )}
      </div>

      {/* Modal: Add Entity */}
      {showAddEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel-elevated p-6 rounded-2xl max-w-md w-full font-mono text-xs shadow-2xl border border-white/10">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Create Entity</h3>
              <button onClick={() => setShowAddEntity(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddEntity} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Entity Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sabil Murti, 9Router, Next.js"
                  value={newEntity.name}
                  onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Type</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Person, Service, Tool"
                    value={newEntity.entityType}
                    onChange={(e) => setNewEntity({ ...newEntity, entityType: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Domain</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. personal, architecture"
                    value={newEntity.domain}
                    onChange={(e) => setNewEntity({ ...newEntity, domain: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Visibility</label>
                <select
                  value={newEntity.visibility}
                  onChange={(e) => setNewEntity({ ...newEntity, visibility: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="PRIVATE">PRIVATE (Restricted)</option>
                  <option value="PUBLIC">PUBLIC (Cross-Agent)</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Allowed Agents (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. antigravity, seiza, chat"
                  value={newEntity.allowedAgents}
                  onChange={(e) => setNewEntity({ ...newEntity, allowedAgents: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddEntity(false)}
                  className="px-4 py-2 border border-white/10 text-zinc-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-xl shadow-glow-amber hover:from-amber-400"
                >
                  Create Entity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Observation */}
      {showAddObservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel-elevated p-6 rounded-2xl max-w-md w-full font-mono text-xs shadow-2xl border border-white/10">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Add Fact Observation</h3>
              <button onClick={() => setShowAddObservation(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddObservation} className="space-y-4">
              {!selectedEntity && (
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Target Entity Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sabil Murti"
                    value={newObservation.entityName}
                    onChange={(e) => setNewObservation({ ...newObservation, entityName: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Fact Statement</label>
                <textarea
                  required
                  placeholder="e.g. Uses Gemini 3.8 Flash model for IDE reasoning."
                  value={newObservation.content}
                  onChange={(e) => setNewObservation({ ...newObservation, content: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 h-24"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Importance</label>
                  <select
                    value={newObservation.importance}
                    onChange={(e) => setNewObservation({ ...newObservation, importance: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Confidence</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={newObservation.confidence}
                    onChange={(e) => setNewObservation({ ...newObservation, confidence: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddObservation(false)}
                  className="px-4 py-2 border border-white/10 text-zinc-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-xl shadow-glow-amber hover:from-amber-400"
                >
                  Inject Fact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Relation */}
      {showAddRelation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel-elevated p-6 rounded-2xl max-w-md w-full font-mono text-xs shadow-2xl border border-white/10">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Establish Relation</h3>
              <button onClick={() => setShowAddRelation(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddRelation} className="space-y-4">
              {!selectedEntity && (
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">From Entity</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sabil Murti"
                    value={newRelation.fromEntityName}
                    onChange={(e) => setNewRelation({ ...newRelation, fromEntityName: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">To Entity</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amneshia"
                  value={newRelation.toEntityName}
                  onChange={(e) => setNewRelation({ ...newRelation, toEntityName: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Relationship Type (Edge)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. creator_of, uses, works_on"
                  value={newRelation.relationType}
                  onChange={(e) => setNewRelation({ ...newRelation, relationType: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddRelation(false)}
                  className="px-4 py-2 border border-white/10 text-zinc-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-xl shadow-glow-amber hover:from-amber-400"
                >
                  Create Edge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryTable;
