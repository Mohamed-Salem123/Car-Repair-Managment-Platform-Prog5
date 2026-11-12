import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../db';
import { publishEvent } from '../services/rabbitmq.service';
import { checkInvoicePaid } from '../services/payment-check.service';

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['DIAGNOSED'],
  DIAGNOSED: ['APPROVED'],
  APPROVED: ['IN_PROGRESS'],
  IN_PROGRESS: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['COMPLETED'],
  COMPLETED: [],
};

export async function createRepairOrder(req: AuthRequest, res: Response) {
  try {
    const { vehicleId, problemDescription, handoverDate, handoverTime } = req.body;
    const customerId = req.user!.userId;

    // Verify vehicle ownership
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || (vehicle.customerId !== customerId && req.user!.role !== 'ADMIN')) {
      return res.status(404).json({
        success: false,
        error: { code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' },
      });
    }

    const repairOrder = await prisma.repairOrder.create({
      data: {
        customerId,
        vehicleId,
        problemDescription,
        handoverDate,
        handoverTime,
        status: 'SUBMITTED',
      },
      include: { vehicle: true },
    });

    // Publish event
    await publishEvent('repair.created', {
      repairOrderId: repairOrder.id,
      customerId: repairOrder.customerId,
      vehicleId: repairOrder.vehicleId,
      status: repairOrder.status,
    });

    res.status(201).json({ success: true, data: { repairOrder } });
  } catch (error) {
    console.error('Create repair order error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_FAILED', message: 'Failed to create repair order' },
    });
  }
}

export async function getRepairOrders(req: AuthRequest, res: Response) {
  try {
    const { userId, role } = req.user!;

    const repairOrders = await prisma.repairOrder.findMany({
      where: role === 'ADMIN' ? {} : { customerId: userId },
      include: {
        vehicle: true,
        photos: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { repairOrders } });
  } catch (error) {
    console.error('Get repair orders error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch repair orders' },
    });
  }
}

export async function getRepairOrderById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { userId, role } = req.user!;

    const repairOrder = await prisma.repairOrder.findUnique({
      where: { id },
      include: {
        vehicle: true,
        photos: true,
      },
    });

    if (!repairOrder) {
      return res.status(404).json({
        success: false,
        error: { code: 'REPAIR_NOT_FOUND', message: 'Repair order not found' },
      });
    }

    if (role !== 'ADMIN' && repairOrder.customerId !== userId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    res.json({ success: true, data: { repairOrder } });
  } catch (error) {
    console.error('Get repair order error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch repair order' },
    });
  }
}

export async function updateRepairOrder(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { diagnosis, requiredWork, estimatedCost, expectedPickupDate, status } = req.body;

    const existing = await prisma.repairOrder.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'REPAIR_NOT_FOUND', message: 'Repair order not found' },
      });
    }

    // Validate status transition
    if (status && !VALID_STATUS_TRANSITIONS[existing.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from ${existing.status} to ${status}`,
        },
      });
    }

    // Business rule: a repair order can only be marked COMPLETED after the
    // customer has paid the invoice. Verified via the payment service API.
    if (status === 'COMPLETED') {
      const check = await checkInvoicePaid(id, req.headers.authorization || '');
      if (!check.invoiceExists) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_REQUIRED',
            message: 'Repair order cannot be completed: no invoice exists yet (invoice is created when the repair is diagnosed)',
          },
        });
      }
      if (!check.paid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_REQUIRED',
            message: 'Repair order cannot be completed until the customer pays the invoice',
          },
        });
      }
    }

    const repairOrder = await prisma.repairOrder.update({
      where: { id },
      data: {
        ...(diagnosis && { diagnosis }),
        ...(requiredWork && { requiredWork }),
        ...(estimatedCost && { estimatedCost: parseFloat(estimatedCost) }),
        ...(expectedPickupDate && { expectedPickupDate }),
        ...(status && { status }),
      },
      include: { vehicle: true, photos: true },
    });

    // Publish events
    if (diagnosis && !existing.diagnosis) {
      await publishEvent('repair.diagnosed', {
        repairOrderId: repairOrder.id,
        customerId: repairOrder.customerId,
        estimatedCost: repairOrder.estimatedCost || 0,
      });
    }
    if (status === 'IN_PROGRESS') {
      await publishEvent('repair.started', {
        repairOrderId: repairOrder.id,
        customerId: repairOrder.customerId,
      });
    }
    if (status === 'READY_FOR_PICKUP') {
      await publishEvent('repair.ready', {
        repairOrderId: repairOrder.id,
        customerId: repairOrder.customerId,
      });
    }
    if (status === 'COMPLETED') {
      await publishEvent('repair.completed', {
        repairOrderId: repairOrder.id,
        customerId: repairOrder.customerId,
      });
    }

    res.json({ success: true, data: { repairOrder } });
  } catch (error) {
    console.error('Update repair order error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update repair order' },
    });
  }
}

export async function uploadPhotos(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILES', message: 'No files uploaded' },
      });
    }

    const repairOrder = await prisma.repairOrder.findUnique({ where: { id } });
    if (!repairOrder) {
      return res.status(404).json({
        success: false,
        error: { code: 'REPAIR_NOT_FOUND', message: 'Repair order not found' },
      });
    }

    if (repairOrder.customerId !== req.user!.userId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const photos = await Promise.all(
      files.map((file) =>
        prisma.repairPhoto.create({
          data: {
            repairOrderId: id,
            fileName: file.filename,
            filePath: `/uploads/${file.filename}`,
            mimeType: file.mimetype,
          },
        })
      )
    );

    res.status(201).json({ success: true, data: { photos } });
  } catch (error) {
    console.error('Upload photos error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPLOAD_FAILED', message: 'Failed to upload photos' },
    });
  }
}
