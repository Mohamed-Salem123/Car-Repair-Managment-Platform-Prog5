import { Router } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import path from 'path';
import {
  createRepairOrder,
  getRepairOrders,
  getRepairOrderById,
  updateRepairOrder,
  uploadPhotos,
} from '../controllers/repair.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

const router = Router();

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, jpeg, png, webp) are allowed'));
    }
  },
});

router.post(
  '/',
  authenticate,
  [
    body('vehicleId').trim().notEmpty().withMessage('Vehicle ID is required'),
    body('problemDescription')
      .trim()
      .notEmpty()
      .withMessage('Problem description is required'),
    body('handoverDate').trim().notEmpty().withMessage('Handover date is required'),
    body('handoverTime').trim().notEmpty().withMessage('Handover time is required'),
  ],
  validate,
  createRepairOrder
);

router.get('/', authenticate, getRepairOrders);
router.get('/:id', authenticate, getRepairOrderById);

/**
 * Admin review validation: when the admin submits a review (any of the review
 * fields is present), ALL review fields are mandatory. Status-only updates
 * (e.g. { status: 'APPROVED' }) pass through without this requirement.
 */
function validateAdminReview(req: any, res: any, next: any) {
  const body = req.body || {};
  const reviewFields = ['diagnosis', 'requiredWork', 'estimatedCost', 'expectedPickupDate'] as const;
  const filled = reviewFields.filter(
    (f) => body[f] !== undefined && body[f] !== null && String(body[f]).trim() !== ''
  );

  if (filled.length === 0) {
    // Status-only transition (or no-op) — nothing to require
    return next();
  }

  if (filled.length < reviewFields.length) {
    const missing = reviewFields.filter((f) => !filled.includes(f));
    return res.status(400).json({
      success: false,
      error: {
        code: 'REVIEW_FIELDS_REQUIRED',
        message: `All review fields are mandatory. Missing: ${missing.join(', ')}`,
      },
    });
  }

  const cost = parseFloat(body.estimatedCost);
  if (Number.isNaN(cost) || cost < 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Estimated cost must be a non-negative number',
      },
    });
  }

  if (Number.isNaN(Date.parse(body.expectedPickupDate))) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Expected pickup date must be a valid date',
      },
    });
  }

  next();
}

router.patch(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  validateAdminReview,
  updateRepairOrder
);

router.post(
  '/:id/photos',
  authenticate,
  upload.array('photos', 10),
  uploadPhotos
);

export default router;
