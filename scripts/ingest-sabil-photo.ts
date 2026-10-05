import path from 'node:path';
import { DatabaseLayer } from '../src/database/index.js';
import { KnowledgeGraph } from '../src/graph.js';
import { DualWriteSync, resolveStorageConfig } from '../src/storage/index.js';

async function main() {
  const config = resolveStorageConfig(false); // Global ~/.amneshia
  console.log(`Using dataDir: ${config.dataDir}`);
  console.log(`Using knowledgeDir: ${config.knowledgeDir}`);

  const db = new DatabaseLayer(config.dataDir);
  const sync = new DualWriteSync(config.knowledgeDir, db);
  const graph = new KnowledgeGraph(db, sync);

  const photoPath = path.resolve(process.cwd(), 'scratch/sabil-foto.jpeg');

  const result = await graph.rememberMedia({
    filePath: photoPath,
    entity: 'Sabil Murti Foto Profil',
    domain: 'personal',
    facts: [
      'Foto profil dan potret resmi pribadi Sabil Murti.',
      'Disimpan dalam Amneshia Media Memory CAS (Content-Addressable Storage) dengan integritas kriptografis SHA-256.',
      'Aset media terverifikasi dengan relasi langsung depicts ke entity utama Sabil Murti.'
    ],
    tier: 'invariant',
    relations: [
      { to: 'Sabil Murti', relationType: 'depicts' }
    ]
  });

  console.log('Ingestion success:', JSON.stringify(result, null, 2));

  // Sync all markdown files to ensure dual-write consistency
  const syncedCount = sync.syncAll();
  console.log(`Synced ${syncedCount} entities to markdown.`);
  db.close();
}

main().catch((err) => {
  console.error('Fatal error during photo ingestion:', err);
  process.exit(1);
});
