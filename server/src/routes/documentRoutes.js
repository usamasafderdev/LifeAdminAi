import express from 'express';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentFile,
  listDocuments,
  updateDocument,
  uploadDocument,
  analyzeDocument,
  analyzeTogether,
  getDocumentIntelligenceHistory,
  confirmDocumentAnalysis,
  getDocumentAnalysis,
  rejectDocumentAnalysis,
  createTasksFromAnalysis,
  generateDocument,
} from '../controllers/documentController.js';
import {
  getDocumentSource,
  clearDocumentChat,
  downloadGeneratedDocument,
  getDocumentChat,
  postDocumentChat,
} from '../controllers/documentChatController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadErrorHandler, uploadSingleFile } from '../config/upload.js';

const router = express.Router();

router.use(protect);
router.post('/generate', generateDocument);
router.post('/analyze-together', analyzeTogether);
router.get('/intelligence/:id', getDocumentIntelligenceHistory);
router.post('/upload', uploadSingleFile, uploadErrorHandler, uploadDocument);
router.post('/generate', generateDocument);
router.get('/generated/:generatedId/download', downloadGeneratedDocument);
router.route('/').post(createDocument).get(listDocuments);
router.get('/:id/file', getDocumentFile);
router.get('/:id/chunks/:chunkIndex', getDocumentSource);
router.post('/:id/analyze', analyzeDocument);
router.get('/:id/analysis', getDocumentAnalysis);
router.post('/:id/analysis/confirm', confirmDocumentAnalysis);
router.post('/:id/analysis/reject', rejectDocumentAnalysis);
router.post('/:id/create-tasks', createTasksFromAnalysis);
router.route('/:id/chat').get(getDocumentChat).post(postDocumentChat).delete(clearDocumentChat);
router.get('/:id/generated/:generatedId/download', downloadGeneratedDocument);
router.route('/:id').get(getDocument).patch(updateDocument).delete(deleteDocument);

export default router;
