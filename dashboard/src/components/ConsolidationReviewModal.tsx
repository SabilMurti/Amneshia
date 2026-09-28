import React from 'react';
import { ShieldCheck, X, ChevronRight, Trash2, Moon } from 'lucide-react';

interface SupersededProposal {
  oldId: string;
  newId: string;
  reason: string;
  oldContent?: string;
  newContent?: string;
}

interface SynthesizedProposal {
  entityId: string;
  entityName: string;
  proposedContent: string;
  oldObservationIds: string[];
  oldContents: string[];
}

interface ConsolidationReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  superseded: SupersededProposal[];
  synthesized: SynthesizedProposal[];
  onApprove: (approvedSuperseded: SupersededProposal[], approvedSynthesized: SynthesizedProposal[]) => Promise<void>;
}

export const ConsolidationReviewModal: React.FC<ConsolidationReviewModalProps> = ({
  isOpen,
  onClose,
  superseded,
  synthesized,
  onApprove,
}) => {
  const [selectedSuperseded, setSelectedSuperseded] = React.useState<Record<string, boolean>>({});
  const [selectedSynthesized, setSelectedSynthesized] = React.useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      const supMap: Record<string, boolean> = {};
      superseded.forEach((s) => {
        supMap[s.oldId] = true;
      });
      setSelectedSuperseded(supMap);

      const synMap: Record<string, boolean> = {};
      synthesized.forEach((_, idx) => {
        synMap[idx] = true;
      });
      setSelectedSynthesized(synMap);
    }
  }, [isOpen, superseded, synthesized]);

  if (!isOpen) return null;

  const handleToggleSuperseded = (oldId: string) => {
    setSelectedSuperseded((prev) => ({ ...prev, [oldId]: !prev[oldId] }));
  };

  const handleToggleSynthesized = (idx: number) => {
    setSelectedSynthesized((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleExecute = async () => {
    setIsSubmitting(true);
    try {
      const approvedSup = superseded.filter((s) => selectedSuperseded[s.oldId]);
      const approvedSyn = synthesized.filter((_, idx) => selectedSynthesized[idx]);
      await onApprove(approvedSup, approvedSyn);
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeSupCount = superseded.filter((s) => selectedSuperseded[s.oldId]).length;
  const activeSynCount = synthesized.filter((_, idx) => selectedSynthesized[idx]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-mono text-zinc-300 select-none">
      <div className="double-bezel-shell max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="double-bezel-core flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-purple-500/20 flex items-center justify-between bg-black/40">
            <div className="flex items-center gap-2.5 text-white">
              <Moon className="w-5 h-5 text-purple-400 fill-purple-400/20 animate-pulse" />
              <div>
                <h3 className="text-sm font-bold tracking-tight font-sans">
                  Sleep Cycle Consolidation Proposals
                </h3>
                <p className="text-[10px] text-zinc-400 font-mono">
                  Jaccard similarity deduplication & truth maintenance resolution
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            <p className="text-zinc-400 font-sans leading-relaxed">
              Review proposed mutations below. Approved conflict resolutions will deprecate redundant observations, and syntheses will form unified factual nodes.
            </p>

            {/* Supersessions List */}
            {superseded.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5 text-xs">
                  <Trash2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Conflict Resolutions & Supersessions ({superseded.length})</span>
                </h4>
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {superseded.map((s) => {
                    const isChecked = !!selectedSuperseded[s.oldId];
                    return (
                      <div
                        key={s.oldId}
                        onClick={() => handleToggleSuperseded(s.oldId)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                          isChecked
                            ? 'bg-purple-950/30 border-purple-500/40 text-purple-100'
                            : 'bg-black/30 border-white/5 opacity-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="accent-purple-500 rounded bg-zinc-800 border-white/10 w-4 h-4 cursor-pointer mt-0.5"
                        />
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="text-[10px] text-purple-300 font-semibold uppercase">
                            Reason: {s.reason}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                            <div className="p-2.5 bg-black/50 rounded-lg border border-purple-500/15 text-zinc-400 line-clamp-2 text-[11px] font-sans">
                              {s.oldContent}
                            </div>
                            <div className="flex items-center gap-2">
                              <ChevronRight className="w-4 h-4 text-purple-400 shrink-0" />
                              <div className="p-2.5 bg-purple-950/40 rounded-lg border border-purple-500/30 text-purple-100 flex-1 line-clamp-2 text-[11px] font-sans">
                                {s.newContent}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Syntheses List */}
            {synthesized.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Observation Syntheses ({synthesized.length})</span>
                </h4>
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {synthesized.map((s, idx) => {
                    const isChecked = !!selectedSynthesized[idx];
                    return (
                      <div
                        key={idx}
                        onClick={() => handleToggleSynthesized(idx)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                          isChecked
                            ? 'bg-indigo-950/30 border-indigo-500/40 text-indigo-100'
                            : 'bg-black/30 border-white/5 opacity-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="accent-indigo-500 rounded bg-zinc-800 border-white/10 w-4 h-4 cursor-pointer mt-0.5"
                        />
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="text-[10px] text-indigo-300 font-semibold uppercase">
                            Entity: {s.entityName}
                          </div>
                          <div className="space-y-1">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase">Synthesizing Statements:</div>
                            <div className="pl-2 border-l border-indigo-500/20 space-y-1 text-zinc-400 text-[11px] font-sans">
                              {s.oldContents.map((c, cIdx) => (
                                <div key={cIdx}>• {c}</div>
                              ))}
                            </div>
                          </div>
                          <div className="p-2.5 bg-black/60 rounded-lg border border-indigo-500/30 text-white font-medium text-[11px] font-sans">
                            {s.proposedContent}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {superseded.length === 0 && synthesized.length === 0 && (
              <div className="text-center py-8 text-zinc-500 font-mono text-xs">
                No consolidation proposals generated for this memory partition.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-purple-500/20 bg-black/40 flex items-center justify-between">
            <div className="text-[11px] font-mono text-zinc-400">
              Selected: <span className="text-purple-300 font-bold">{activeSupCount}</span> Supersessions,{' '}
              <span className="text-indigo-300 font-bold">{activeSynCount}</span> Syntheses
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-zinc-300 border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={isSubmitting || (activeSupCount === 0 && activeSynCount === 0)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-purple transition-all active:scale-[0.98]"
              >
                {isSubmitting ? 'Consolidating Memories…' : 'Approve & Consolidate'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsolidationReviewModal;
