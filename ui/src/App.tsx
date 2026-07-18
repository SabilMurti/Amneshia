import { useState, useEffect } from 'react';

function App() {
  const [memories, setMemories] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'exact' | 'semantic'>('exact');
  const [form, setForm] = useState({ type: 'user', scope: 'global', content: '' });

  const API_URL = 'http://localhost:3456/api';

  const fetchMemories = async () => {
    let url = `${API_URL}/memories/exact`;
    if (query) {
      if (mode === 'exact') url += `?query=${encodeURIComponent(query)}`;
      else url = `${API_URL}/memories/semantic?query=${encodeURIComponent(query)}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    setMemories(data);
  };

  useEffect(() => {
    fetchMemories();
  }, [query, mode]);

  const addMemory = async (e: any) => {
    e.preventDefault();
    await fetch(`${API_URL}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setForm({ ...form, content: '' });
    fetchMemories();
  };

  const deleteMemory = async (id: string) => {
    if (!confirm('Delete this memory?')) return;
    await fetch(`${API_URL}/memories/${id}`, { method: 'DELETE' });
    fetchMemories();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="flex justify-between items-center bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Amneshia Hub</h1>
          <span className="px-4 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-semibold border border-blue-500/30">
            RAG + Markdown Exporter
          </span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit">
            <h2 className="text-xl font-bold mb-4">Add Memory</h2>
            <form onSubmit={addMemory} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Type</label>
                <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2" 
                  value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="user">User Profile</option>
                  <option value="preference">Preference</option>
                  <option value="project">Project Context</option>
                  <option value="workflow">Workflow / Rule</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Scope</label>
                <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2" 
                  value={form.scope} onChange={e => setForm({...form, scope: e.target.value})} required/>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Content</label>
                <textarea className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 h-32" 
                  value={form.content} onChange={e => setForm({...form, content: e.target.value})} required></textarea>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-2 rounded-lg font-bold">
                Save Memory
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex gap-4 mb-6">
              <input type="text" placeholder="Search memories..." 
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                value={query} onChange={e => setQuery(e.target.value)} />
              
              <select className="bg-slate-800 border border-slate-700 rounded-lg p-3 font-semibold"
                value={mode} onChange={e => setMode(e.target.value as any)}>
                <option value="exact">SQLite (Exact)</option>
                <option value="semantic">ChromaDB (Semantic RAG)</option>
              </select>
            </div>

            <div className="space-y-4">
              {memories.map(mem => (
                <div key={mem.id} className="bg-slate-800 p-5 rounded-xl border border-slate-700 relative group">
                  <div className="flex gap-3 text-sm mb-3">
                    <span className="text-blue-400 font-bold uppercase">[{mem.type}]</span>
                    <span className="text-slate-400">Scope: {mem.scope}</span>
                    <span className="text-slate-500 ml-auto">{mem.created_at.split(' ')[0]}</span>
                  </div>
                  <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{mem.content}</p>
                  
                  <button onClick={() => deleteMemory(mem.id)} 
                    className="absolute top-4 right-4 text-red-400 opacity-0 group-hover:opacity-100 hover:underline text-sm transition-opacity">
                    Delete
                  </button>
                </div>
              ))}
              {memories.length === 0 && (
                <div className="text-center text-slate-500 py-12 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
                  No memories found matching your criteria.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
