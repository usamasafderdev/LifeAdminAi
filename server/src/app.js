import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import reminderRoutes from './routes/reminderRoutes.js';
import integrationRoutes from './routes/integrationRoutes.js';
import assistantRoutes from './routes/assistantRoutes.js';
import memoryRoutes from './routes/memoryRoutes.js';
import briefingRoutes from './routes/briefingRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LifeAdmin API is running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/api/briefings', briefingRoutes);
app.use('/api/schedule', calendarRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', integrationRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
