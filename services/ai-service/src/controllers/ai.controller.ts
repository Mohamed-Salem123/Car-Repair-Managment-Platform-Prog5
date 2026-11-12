import { Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth.middleware';
import { getAIProvider } from '../services/ai-provider.service';

const REPAIR_SERVICE_URL = process.env.REPAIR_SERVICE_URL || 'http://repair-service:8002';

export async function chat(req: AuthRequest, res: Response) {
  try {
    const { repairOrderId, question } = req.body;
    const userId = req.user!.userId;

    if (!repairOrderId || !question) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'repairOrderId and question are required' },
      });
    }

    // Fetch repair order details from Repair Service
    let repairOrder;
    try {
      const response = await axios.get(`${REPAIR_SERVICE_URL}/repairs/${repairOrderId}`, {
        headers: { Authorization: req.headers.authorization },
      });
      repairOrder = response.data.data.repairOrder;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          error: { code: 'REPAIR_NOT_FOUND', message: 'Repair order not found' },
        });
      }
      if (error.response?.status === 403) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        });
      }
      throw error;
    }

    // Verify customer ownership
    if (repairOrder.customerId !== userId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    // Build context for AI
    const context = {
      diagnosis: repairOrder.diagnosis || 'Not yet diagnosed',
      requiredWork: repairOrder.requiredWork || 'Not yet specified',
      estimatedCost: repairOrder.estimatedCost || 'Not yet estimated',
      expectedPickupDate: repairOrder.expectedPickupDate || 'Not yet scheduled',
      status: repairOrder.status,
      vehicleMake: repairOrder.vehicle.make,
      vehicleModel: repairOrder.vehicle.model,
      vehicleYear: repairOrder.vehicle.year,
    };

    // Get AI provider and generate response
    const aiProvider = getAIProvider();
    const answer = await aiProvider.generateResponse(question, context);

    res.json({
      success: true,
      data: {
        question,
        answer,
        context,
      },
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'AI_ERROR', message: 'Failed to process AI request' },
    });
  }
}
