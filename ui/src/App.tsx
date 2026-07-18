import { useState, useEffect } from 'react';

function App() {
  const [memories, setMemories] = useState<any[]>([]);
  const [exports, setExports] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'exact' | 'semantic'>('exact');
  const [activeTab, setActiveTab] = useState<'memories' | 'exports'>('memories');
  
  const [form, setForm] = useState({ type: 'user', scope: 'global', content: '', tags: '' });
  const [exportForm, setExportForm] = useState({ name: '', path: '' });

  const API_URL = 'http://localhost:3457/api';

  const fetchMemories = async () => {
    let url = `${API_URL}/memories/exact`;
    if (query) {
      if (mode === 'exact') url += `?query=${encodeURIComponent(query)}`;
      else url = `${API_URL}/memories/semantic?query=${encodeURIComponent(query)}`;
    }
    try {
      const res = await fetch(url);
      const data = await res.json();
      setMemories(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchExports = async () => {
    try {
      const res = await fetch(`${API_URL}/exports`);
      const data = await res.json();
      setExports(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchMemories();
    fetchExports();
  }, [query, mode]);

  const addMemory = async (e: any) => {
    e.preventDefault();
    const tagsArray = form.tags.split(',').map(t => t.trim()).filter(t => t);
    await fetch(`${API_URL}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tags: tagsArray })
    });
    setForm({ ...form, content: '', tags: '' });
    fetchMemories();
  };

  const deleteMemory = async (id: string) => {
    if (!confirm('Delete this memory?')) return;
    await fetch(`${API_URL}/memories/${id}`, { method: 'DELETE' });
    fetchMemories();
  };

  const addExport = async (e: any) => {
    e.preventDefault();
    await fetch(`${API_URL}/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exportForm)
    });
    setExportForm({ name: '', path: '' });
    fetchExports();
  };

  const deleteExport = async (id: string) => {
    if (!confirm('Remove this export target?')) return;
    await fetch(`${API_URL}/exports/${id}`, { method: 'DELETE' });
    fetchExports();
  };
  
  const triggerExportNow = async () => {
    await fetch(`${API_URL}/export_now`, { method: 'POST' });
    alert('Export triggered successfully across all targets!');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent">
              Amneshia Hub
            </h1>
            <p className="text-sm text-slate-400 mt-1">Single Source of Truth Memory System</p>
          </div>
          <div className="flex gap-4">
            <button onClick={triggerExportNow} className="px-4 py-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-sm font-semibold transition-colors">
              Force Sync Exporter
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('memories')} 
            className={`px-5 py-2.5 rounded-lg font-semibold transition-all ${activeTab === 'memories' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'}`}>
            Memory Database
          </button>
          <button onClick={() => setActiveTab('exports')} 
            className={`px-5 py-2.5 rounded-lg font-semibold transition-all ${activeTab === 'exports' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'}`}>
            Export Targets
          </button>
        </div>

        {/* Tab Content: Memories */}
        {activeTab === 'memories' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Sidebar: Add Memory */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-fit shadow-lg">
              <h2 className="text-lg font-bold text-white mb-5">Add New Memory</h2>
              <form onSubmit={addMemory} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Type</label>
                  <select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
                    value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="user">User Profile</option>
                    <option value="preference">Preference</option>
                    <option value="project">Project Context</option>
                    <option value="workflow">Workflow / Rule</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Scope</label>
                  <input type="text" placeholder="e.g. global, amneshia" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
                    value={form.scope} onChange={e => setForm({...form, scope: e.target.value})} required/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Tags (comma separated)</label>
                  <input type="text" placeholder="e.g. UI, rules, urgent" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
                    value={form.tags} onChange={e => setForm({...form, tags: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Content</label>
                  <textarea className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm h-32 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none" 
                    value={form.content} onChange={e => setForm({...form, content: e.target.value})} required></textarea>
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-2.5 rounded-lg font-bold text-white shadow-lg shadow-blue-500/20 mt-2">
                  Commit Memory
                </button>
              </form>
            </div>

            {/* Main Content: Search & List */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Search Bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input type="text" placeholder="Search memories..." 
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 pl-11 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-sm"
                    value={query} onChange={e => setQuery(e.target.value)} />
                  <svg className="w-5 h-5 absolute left-4 top-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <select className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                  value={mode} onChange={e => setMode(e.target.value as any)}>
                  <option value="exact">⚡ SQLite (Exact)</option>
                  <option value="semantic">🧠 ChromaDB (RAG)</option>
                </select>
              </div>

              {/* Memory List */}
              <div className="space-y-4">
                {memories.map(mem => (
                  <div key={mem.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800/60 hover:border-slate-700 transition-all relative group shadow-sm">
                    <div className="flex flex-wrap gap-2 items-center mb-3">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider
                        ${mem.type === 'user' ? 'bg-purple-500/10 text-purple-400' : 
                          mem.type === 'project' ? 'bg-emerald-500/10 text-emerald-400' : 
                          mem.type === 'workflow' ? 'bg-orange-500/10 text-orange-400' : 
                          'bg-blue-500/10 text-blue-400'}`}>
                        {mem.type}
                      </span>
                      <span className="text-slate-400 text-sm font-medium">#{mem.scope}</span>
                      
                      {Array.isArray(mem.tags) && mem.tags.length > 0 && mem.tags.map((tag: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded text-xs">{tag}</span>
                      ))}

                      <span className="text-slate-600 text-xs ml-auto font-mono">{mem.created_at.split(' ')[0]}</span>
                    </div>
                    
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{mem.content}</p>
                    
                    <button onClick={() => deleteMemory(mem.id)} 
                      className="absolute top-4 right-4 p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                ))}
                
                {memories.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
                    <svg className="w-12 h-12 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    <p className="text-slate-400 text-sm">No memories found in this sector.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Tab Content: Exports */}
        {activeTab === 'exports' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-fit shadow-lg">
              <h2 className="text-lg font-bold text-white mb-5">Add Target Path</h2>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Provide an absolute directory path to split into <code className="text-blue-400">USER.md</code> & <code className="text-blue-400">MEMORY.md</code>, <br/>
                <b>OR</b> provide a specific Markdown file path (e.g. <code className="text-blue-400">/home/murtix/project/GEMINI.md</code>) to bundle everything into that single file!
              </p>
              <form onSubmit={addExport} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Target Name</label>
                  <input type="text" placeholder="e.g. Antigravity IDE (Gemini)" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    value={exportForm.name} onChange={e => setExportForm({...exportForm, name: e.target.value})} required/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Absolute File / Directory Path</label>
                  <input type="text" placeholder="e.g. /home/murtix/project/GEMINI.md" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono" 
                    value={exportForm.path} onChange={e => setExportForm({...exportForm, path: e.target.value})} required/>
                </div>
                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 transition-colors py-2.5 rounded-lg font-bold text-white shadow-lg shadow-cyan-500/20 mt-2">
                  Register Target
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-bold text-white mb-4">Active Export Targets</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {exports.map(exp => (
                  <div key={exp.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 relative group">
                    <h3 className="font-bold text-slate-200 mb-1">{exp.name}</h3>
                    <code className="text-xs text-slate-400 block bg-slate-950 p-2 rounded border border-slate-800 break-all">
                      {exp.path}
                    </code>
                    <button onClick={() => deleteExport(exp.id)} 
                      className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;