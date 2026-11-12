import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  registerAdmin,
} from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/admins/register', authenticate, registerAdmin);
router.get('/', authenticate, getNotifications);
router.patch('/:id/read', authenticate, markAsRead);
router.patch('/read-all', authenticate, markAllAsRead);

export default router;
