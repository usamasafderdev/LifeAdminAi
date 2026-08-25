import express from 'express';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentFile,
  listDocuments,
  updateDocument,
  uploadDocument,
} from '../controllers/documentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadErrorHandler, uploadSingleFile } from '../config/upload.js';

const router = express.Router();

router.use(protect);
router.post('/upload', uploadSingleFile, uploadErrorHandler, uploadDocument);
router.route('/').post(createDocument).get(listDocuments);
router.get('/:id/file', getDocumentFile);
router.route('/:id').get(getDocument).patch(updateDocument).delete(deleteDocument);

export default router;
