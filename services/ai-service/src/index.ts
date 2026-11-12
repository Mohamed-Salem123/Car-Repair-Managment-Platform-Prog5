import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRoutes from './routes/ai.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8005;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'ai-service', status: 'ok' });
});

app.use('/ai/chat', aiRoutes);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✓ AI Service running on port ${PORT}`);
});
