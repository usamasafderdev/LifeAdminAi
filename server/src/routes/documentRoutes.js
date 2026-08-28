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
  confirmDocumentAnalysis,
  getDocumentAnalysis,
  rejectDocumentAnalysis,
  createTasksFromAnalysis,
} from '../controllers/documentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadErrorHandler, uploadSingleFile } from '../config/upload.js';

const router = express.Router();

router.use(protect);
router.post('/upload', uploadSingleFile, uploadErrorHandler, uploadDocument);
router.route('/').post(createDocument).get(listDocuments);
router.get('/:id/file', getDocumentFile);
router.post('/:id/analyze', analyzeDocument);
router.get('/:id/analysis', getDocumentAnalysis);
router.post('/:id/analysis/confirm', confirmDocumentAnalysis);
router.post('/:id/analysis/reject', rejectDocumentAnalysis);
router.post('/:id/create-tasks', createTasksFromAnalysis);
router.route('/:id').get(getDocument).patch(updateDocument).delete(deleteDocument);

export default router;
