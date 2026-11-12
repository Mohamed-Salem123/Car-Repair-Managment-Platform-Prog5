import express from 'express';
import cors from 'cors';
import path from 'path';
import vehicleRoutes from './routes/vehicle.routes';
import repairRoutes from './routes/repair.routes';
import { errorHandler } from './middleware/error.middleware';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'repair-service', status: 'ok' });
});

// Routes
app.use('/vehicles', vehicleRoutes);
app.use('/repairs', repairRoutes);

// Error handling
app.use(errorHandler);

export default app;
