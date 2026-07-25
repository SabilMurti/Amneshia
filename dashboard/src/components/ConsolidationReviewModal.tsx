import React from 'react';
import { ShieldCheck, X, ChevronRight, Sparkles, Trash2 } from 'lucide-react';

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

  // Initialize all to selected by default
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono text-zinc-300">
      <div className="bg-[#121215] border border-[#27272a] rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#27272a] flex items-center justify-between bg-zinc-950/40">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Sleep Cycle Consolidation Proposals</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          <p className="text-zinc-400">
            Below are proposed consolidations computed from Jaccard similarities and LLM conflict resolution. Review and approve the memory modifications.
          </p>

          {/* Supersessions List */}
          {superseded.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                Conflict Resolutions & Supersessions ({superseded.length})
              </h4>
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {superseded.map((s) => {
                  const isChecked = !!selectedSuperseded[s.oldId];
                  return (
                    <div
                      key={s.oldId}
                      onClick={() => handleToggleSuperseded(s.oldId)}
                      className={`p-3 rounded border transition-all cursor-pointer flex gap-3 ${
                        isChecked
                          ? 'bg-amber-950/10 border-amber-900/30'
                          : 'bg-zinc-900/10 border-[#27272a] opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="accent-amber-500 rounded bg-zinc-800 border-[#27272a] w-3.5 h-3.5 cursor-pointer mt-0.5"
                      />
                      <div className="flex-1 space-y-1.5">
                        <div className="text-[10px] text-zinc-500 uppercase">Reason: {s.reason}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                          <div className="p-2 bg-zinc-950/60 rounded border border-zinc-900 text-zinc-500 line-clamp-2">
                            {s.oldContent}
                          </div>
                          <div className="flex items-center gap-2">
                            <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
                            <div className="p-2 bg-zinc-900/80 rounded border border-zinc-800 text-zinc-300 flex-1 line-clamp-2">
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
              <h4 className="font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Observation Syntheses & Summaries ({synthesized.length})
              </h4>
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {synthesized.map((s, idx) => {
                  const isChecked = !!selectedSynthesized[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => handleToggleSynthesized(idx)}
                      className={`p-3 rounded border transition-all cursor-pointer flex gap-3 ${
                        isChecked
                          ? 'bg-blue-950/10 border-blue-900/30'
                          : 'bg-zinc-900/10 border-[#27272a] opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="accent-blue-500 rounded bg-zinc-800 border-[#27272a] w-3.5 h-3.5 cursor-pointer mt-0.5"
                      />
                      <div className="flex-1 space-y-1.5">
                        <div className="text-[10px] text-zinc-500 uppercase">Entity: {s.entityName}</div>
                        <div className="space-y-1">
                          <div className="text-[10px] text-zinc-600 font-bold">Consolidating:</div>
                          <div className="pl-2 border-l border-zinc-800 space-y-1 text-zinc-500">
                            {s.oldContents.map((c, cIdx) => (
                              <div key={cIdx}>• {c}</div>
                            ))}
                          </div>
                        </div>
                        <div className="p-2 bg-zinc-900/80 rounded border border-zinc-800 text-zinc-300 font-bold">
                          Proposed: {s.proposedContent}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {superseded.length === 0 && synthesized.length === 0 && (
            <div className="text-center py-6 text-zinc-500">
              No consolidation proposals generated for this slice of memory.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#27272a] bg-zinc-950/40 flex items-center justify-between">
          <div className="text-[10px] text-zinc-500">
            Selected: <span className="text-amber-500 font-bold">{activeSupCount}</span> Supersessions,{' '}
            <span className="text-blue-400 font-bold">{activeSynCount}</span> Syntheses
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-xs border border-[#27272a]"
            >
              Cancel
            </button>
            <button
              onClick={handleExecute}
              disabled={isSubmitting || (activeSupCount === 0 && activeSynCount === 0)}
              className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-xs text-zinc-950 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Executing Consolidation...' : 'Approve & Execute'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
