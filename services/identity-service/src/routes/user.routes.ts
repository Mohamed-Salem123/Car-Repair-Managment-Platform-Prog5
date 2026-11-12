import { Router } from 'express';
import { getMe, getUserById } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/me', authenticate, getMe);
router.get('/:id', authenticate, getUserById);

export default router;
