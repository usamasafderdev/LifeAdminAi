import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import { connectDB } from './config/db.js';

const port = Number(process.env.PORT) || 5000;
let httpServer;
let shuttingDown = false;

async function startServer() {
  try {
    await connectDB();
    httpServer = app.listen(port, () => {
      console.log(`LifeAdmin API running on port ${port}`);
    });
  } catch (error) {
    console.error(`Failed to start LifeAdmin API: ${error.message}`);
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Shutting down...`);

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  await mongoose.connection.close();
  console.log('LifeAdmin API stopped cleanly');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
