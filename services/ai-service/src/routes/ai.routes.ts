import { Router } from 'express';
import { chat } from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticate, chat);

export default router;
