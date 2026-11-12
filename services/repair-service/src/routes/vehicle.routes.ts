import { Router } from 'express';
import { body } from 'express-validator';
import {
  createVehicle,
  getVehicles,
  getVehicleById,
} from '../controllers/vehicle.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

const router = Router();

router.post(
  '/',
  authenticate,
  [
    body('make').trim().notEmpty().withMessage('Make is required'),
    body('model').trim().notEmpty().withMessage('Model is required'),
    body('year').isInt({ min: 1900, max: 2100 }).withMessage('Valid year required'),
    body('plateNumber').trim().notEmpty().withMessage('Plate number is required'),
    body('color').trim().notEmpty().withMessage('Color is required'),
  ],
  validate,
  createVehicle
);

router.get('/', authenticate, getVehicles);
router.get('/:id', authenticate, getVehicleById);

export default router;
