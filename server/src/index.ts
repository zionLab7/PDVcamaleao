import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import productsRoutes from './routes/products';
import salesRoutes from './routes/sales';
import cashRegisterRoutes from './routes/cashRegister';
import usersRoutes from './routes/users';
import settingsRoutes from './routes/settings';
import reportsRoutes from './routes/reports';
import adminRoutes from './routes/admin';
import fiscalRoutes from './routes/fiscal';
import categoriesRoutes from './routes/categories';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/cash-register', cashRegisterRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/fiscal', fiscalRoutes);
app.use('/api/categories', categoriesRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
