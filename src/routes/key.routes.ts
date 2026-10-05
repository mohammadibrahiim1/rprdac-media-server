import { Router } from 'express';
import { getEncryptionKey } from '../controllers/key.controller';
import { authStream } from '../middleware/authStream'; 

const router = Router();


router.get('/:courseId/:lessonId', authStream, getEncryptionKey);

export default router;