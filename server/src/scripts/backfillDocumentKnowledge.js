import 'dotenv/config';
import mongoose from 'mongoose';
import Document from '../models/Document.js';
import DocumentChunk from '../models/DocumentChunk.js';
import { ensureDocumentKnowledge } from '../services/documentKnowledgeService.js';

const args = process.argv.slice(2);
const userId = args[0] === '--user' ? args[1] : null;
if (
  !(args.length === 1 && args[0] === '--all') &&
  !(args.length === 2 && mongoose.isObjectIdOrHexString(userId))
) {
  console.error('Usage: node src/scripts/backfillDocumentKnowledge.js --user <user-id> | --all');
  process.exitCode = 1;
} else {
  let indexed = 0;
  let failed = 0;
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await DocumentChunk.createIndexes();
    for await (const document of Document.find(userId ? { userId } : {})
      .select('userId')
      .lean()
      .cursor()) {
      try {
        await ensureDocumentKnowledge(document._id, document.userId);
        indexed++;
      } catch {
        failed++;
      }
    }
    console.log(`Knowledge backfill: ${indexed} ready, ${failed} failed. Rerun to retry failures.`);
    if (failed) process.exitCode = 1;
  } catch {
    console.error(
      'Knowledge backfill could not complete. Check database connectivity and index permissions.',
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
