import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Edit2, Check, X, FileText, Share2, Compass, PlusCircle, AlertTriangle
} from 'lucide-react';
import { api } from '../api/client';
import type { GraphSnapshot, Entity, Observation, RelationWithNames } from '../types';

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
    if (!confirm(`Permanently delete entity "${name}"? This deletes all associated observations and relations.`)) return;
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
    if (!confirm('Delete this observation?')) return;
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
    if (!confirm('Delete this semantic relation?')) return;
    try {
      await api.deleteRelations([id]);
      triggerRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-73px)] bg-[#09090b]">
      {/* List Panel */}
      <div className="flex-1 p-6 border-r border-[#27272a] flex flex-col overflow-hidden">
        {/* Actions header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-zinc-400">
            Memory Directory ({snapshot?.entities.length ?? 0})
          </h2>
          <button
            onClick={() => setShowAddEntity(true)}
            className="flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-black px-3 py-1.5 rounded font-mono text-xs font-semibold select-none transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Entity</span>
          </button>
        </div>

        {/* Loading / Error / Empty States */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center font-mono text-xs text-zinc-500">
            Syncing memory directory...
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center p-6 text-center font-mono text-xs text-red-400">
            <AlertTriangle className="w-5 h-5 text-red-500 mb-2" />
            <p>Directory error: {error}</p>
          </div>
        )}

        {!isLoading && snapshot?.entities.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center select-none text-center">
            <Compass className="w-10 h-10 text-zinc-700 mb-2" />
            <span className="font-mono text-xs text-zinc-500">No matching records found.</span>
          </div>
        )}

        {/* Table of Entities */}
        {snapshot && snapshot.entities.length > 0 && (
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="border border-[#27272a] rounded overflow-hidden">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="bg-[#121215] border-b border-[#27272a] text-zinc-500 select-none">
                    <th className="py-2.5 px-4">Entity</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Domain</th>
                    <th className="py-2.5 px-4">Visibility</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272a]">
                  {snapshot.entities.map((ent) => {
                    const isInspected = selectedEntity?.id === ent.id;
                    return (
                      <tr
                        key={ent.id}
                        onClick={() => selectEntity(ent)}
                        className={`cursor-pointer hover:bg-zinc-900/40 transition-colors ${
                          isInspected ? 'bg-zinc-900/60' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4 font-bold text-zinc-200">{ent.name}</td>
                        <td className="py-2.5 px-4">
                          <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-[#27272a] uppercase">
                            {ent.entityType}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-zinc-400">{ent.domain}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-[10px] uppercase font-semibold ${ent.visibility === 'PUBLIC' ? 'text-green-500' : 'text-zinc-500'}`}>
                            {ent.visibility}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEntity(ent.name);
                            }}
                            className="text-zinc-600 hover:text-red-400 p-1 transition-colors"
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
      <div className="w-full md:w-[480px] p-6 flex flex-col justify-between overflow-hidden bg-[#121215]">
        {selectedEntity ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-[#27272a] pb-4 mb-4 flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold font-mono text-white mb-1.5 break-all">{selectedEntity.name}</h3>
                <div className="flex gap-2">
                  <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-[#27272a]">
                    {selectedEntity.entityType}
                  </span>
                  <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
                    {selectedEntity.domain}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedEntity(null)}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-300"
              >
                Clear selection
              </button>
            </div>

            {/* Content Lists */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-6">
              {/* Observations */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Observations ({selectedEntityObs.length})</span>
                  </span>
                  <button
                    onClick={() => {
                      setNewObservation({ ...newObservation, entityName: selectedEntity.name });
                      setShowAddObservation(true);
                    }}
                    className="flex items-center gap-1 hover:text-[#f59e0b] font-mono text-[10px] text-zinc-400 transition-colors"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>Add Fact</span>
                  </button>
                </div>

                {selectedEntityObs.length === 0 ? (
                  <p className="text-xs font-mono text-zinc-600 italic p-3 bg-zinc-950/20 rounded border border-[#27272a]/30">No statements observed.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEntityObs.map((obs) => {
                      const isEditing = editingObsId === obs.id;
                      return (
                        <div key={obs.id} className="p-3 bg-[#09090b] border border-[#27272a] rounded text-xs flex flex-col justify-between gap-2.5">
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingObsContent}
                                onChange={(e) => setEditingObsContent(e.target.value)}
                                className="w-full bg-[#121215] border border-[#27272a] rounded p-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-[#f59e0b] h-20"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setEditingObsId(null)}
                                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleSaveObservationEdit(obs.id)}
                                  className="p-1 rounded bg-[#f59e0b]/20 hover:bg-[#f59e0b]/30 text-[#f59e0b]"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="font-sans text-zinc-300 leading-relaxed break-words">{obs.content}</p>
                              <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 pt-1.5 border-t border-zinc-900/50">
                                <div className="flex gap-2">
                                  <span className="text-[#f59e0b]">Imp: {obs.importance}</span>
                                  <span>Conf: {obs.confidence}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingObsId(obs.id);
                                      setEditingObsContent(obs.content);
                                    }}
                                    className="text-zinc-500 hover:text-zinc-300 p-0.5"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteObservation(obs.id)}
                                    className="text-zinc-500 hover:text-red-400 p-0.5"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Relations */}
              <div className="space-y-3 pt-4 border-t border-zinc-800/40">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Relations ({selectedEntityRels.length})</span>
                  </span>
                  <button
                    onClick={() => {
                      setNewRelation({ ...newRelation, fromEntityName: selectedEntity.name });
                      setShowAddRelation(true);
                    }}
                    className="flex items-center gap-1 hover:text-[#f59e0b] font-mono text-[10px] text-zinc-400 transition-colors"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>Add Link</span>
                  </button>
                </div>

                {selectedEntityRels.length === 0 ? (
                  <p className="text-xs font-mono text-zinc-600 italic p-3 bg-zinc-950/20 rounded border border-[#27272a]/30">No relations defined.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEntityRels.map((rel) => {
                      const isSource = rel.fromEntityId === selectedEntity.id;
                      const counterPartName = isSource ? rel.toEntityName : rel.fromEntityName;
                      return (
                        <div key={rel.id} className="p-2.5 bg-[#09090b] border border-[#27272a] rounded flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-zinc-500">{isSource ? 'Out' : 'In'}:</span>
                            <span className="text-zinc-300 font-bold truncate max-w-[150px]">{counterPartName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-[#27272a] text-[10px] text-zinc-400 select-none">
                              {rel.relationType}
                            </span>
                            <button
                              onClick={() => handleDeleteRelation(rel.id)}
                              className="text-zinc-500 hover:text-red-400 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center select-none">
            <Compass className="w-12 h-12 text-zinc-800 mb-2" />
            <h3 className="font-mono text-sm font-semibold text-zinc-500 mb-1">Inspector Closed</h3>
            <p className="font-mono text-xs text-zinc-600 max-w-xs">
              Select an entity node from the memory directory list to audit observations, relations, and update factual entries.
            </p>
          </div>
        )}
      </div>

      {/* Modal: Create Entity */}
      {showAddEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4">
          <div className="bg-[#121215] border border-[#27272a] p-6 rounded max-w-md w-full font-mono text-xs shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#27272a] pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Create Entity</h3>
              <button onClick={() => setShowAddEntity(false)} className="text-zinc-500 hover:text-zinc-300">×</button>
            </div>
            <form onSubmit={handleAddEntity} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Unique Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sabil Murti"
                  value={newEntity.name}
                  onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Type</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Person"
                    value={newEntity.entityType}
                    onChange={(e) => setNewEntity({ ...newEntity, entityType: e.target.value })}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Domain</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. personal"
                    value={newEntity.domain}
                    onChange={(e) => setNewEntity({ ...newEntity, domain: e.target.value })}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Visibility</label>
                <select
                  value={newEntity.visibility}
                  onChange={(e) => setNewEntity({ ...newEntity, visibility: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                >
                  <option value="PRIVATE">PRIVATE</option>
                  <option value="PUBLIC">PUBLIC</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Allowed Agents (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. copilot, chat-agent"
                  value={newEntity.allowedAgents}
                  onChange={(e) => setNewEntity({ ...newEntity, allowedAgents: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#27272a] select-none">
                <button
                  type="button"
                  onClick={() => setShowAddEntity(false)}
                  className="px-4 py-2 border border-[#27272a] text-zinc-400 hover:text-zinc-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold rounded"
                >
                  Add Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Observation */}
      {showAddObservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4">
          <div className="bg-[#121215] border border-[#27272a] p-6 rounded max-w-md w-full font-mono text-xs shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#27272a] pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Add Observation</h3>
              <button onClick={() => setShowAddObservation(false)} className="text-zinc-500 hover:text-zinc-300">×</button>
            </div>
            <form onSubmit={handleAddObservation} className="space-y-4">
              {!selectedEntity && (
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Target Entity Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sabil Murti"
                    value={newObservation.entityName}
                    onChange={(e) => setNewObservation({ ...newObservation, entityName: e.target.value })}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>
              )}

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Fact / Content Statement</label>
                <textarea
                  required
                  placeholder="e.g. sabil suka bermain guitar listrik"
                  value={newObservation.content}
                  onChange={(e) => setNewObservation({ ...newObservation, content: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b] h-24"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Importance</label>
                  <select
                    value={newObservation.importance}
                    onChange={(e) => setNewObservation({ ...newObservation, importance: e.target.value })}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Confidence (0.0 - 1.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={newObservation.confidence}
                    onChange={(e) => setNewObservation({ ...newObservation, confidence: e.target.value })}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Expiration Date (Optional)</label>
                <input
                  type="datetime-local"
                  value={newObservation.expiresAt}
                  onChange={(e) => setNewObservation({ ...newObservation, expiresAt: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#27272a] select-none">
                <button
                  type="button"
                  onClick={() => setShowAddObservation(false)}
                  className="px-4 py-2 border border-[#27272a] text-zinc-400 hover:text-zinc-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold rounded"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4">
          <div className="bg-[#121215] border border-[#27272a] p-6 rounded max-w-md w-full font-mono text-xs shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#27272a] pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Add Semantic Relation</h3>
              <button onClick={() => setShowAddRelation(false)} className="text-zinc-500 hover:text-zinc-300">×</button>
            </div>
            <form onSubmit={handleAddRelation} className="space-y-4">
              {!selectedEntity && (
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase font-bold">From Entity Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sabil Murti"
                    value={newRelation.fromEntityName}
                    onChange={(e) => setNewRelation({ ...newRelation, fromEntityName: e.target.value })}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                  />
                </div>
              )}

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">To Entity Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amneshia Project"
                  value={newRelation.toEntityName}
                  onChange={(e) => setNewRelation({ ...newRelation, toEntityName: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Relation Type / Edge Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. creator_of, member_of"
                  value={newRelation.relationType}
                  onChange={(e) => setNewRelation({ ...newRelation, relationType: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#27272a] select-none">
                <button
                  type="button"
                  onClick={() => setShowAddRelation(false)}
                  className="px-4 py-2 border border-[#27272a] text-zinc-400 hover:text-zinc-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold rounded"
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
