import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../db';

export async function createVehicle(req: AuthRequest, res: Response) {
  try {
    const { make, model, year, plateNumber, color } = req.body;
    const customerId = req.user!.userId;

    // Plate numbers are unique across the whole system
    const existing = await prisma.vehicle.findUnique({ where: { plateNumber } });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PLATE_EXISTS',
          message: 'A vehicle with this plate number already exists',
        },
      });
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        customerId,
        make,
        model,
        year: parseInt(year),
        plateNumber,
        color,
      },
    });

    res.status(201).json({
      success: true,
      data: { vehicle },
    });
  } catch (error: any) {
    // Race-condition safety net: the unique index rejects concurrent duplicates
    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PLATE_EXISTS',
          message: 'A vehicle with this plate number already exists',
        },
      });
    }
    console.error('Create vehicle error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_FAILED',
        message: 'Failed to create vehicle',
      },
    });
  }
}

export async function getVehicles(req: AuthRequest, res: Response) {
  try {
    const { userId, role } = req.user!;

    const vehicles = await prisma.vehicle.findMany({
      where: role === 'ADMIN' ? {} : { customerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: { vehicles },
    });
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch vehicles',
      },
    });
  }
}

export async function getVehicleById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { userId, role } = req.user!;

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        repairOrders: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'VEHICLE_NOT_FOUND',
          message: 'Vehicle not found',
        },
      });
    }

    // Authorization check
    if (role !== 'ADMIN' && vehicle.customerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      });
    }

    res.json({
      success: true,
      data: { vehicle },
    });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch vehicle',
      },
    });
  }
}
