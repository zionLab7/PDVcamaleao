import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { tenantId: req.tenantId!, status: 'completed' },
      include: {
        payments: true,
        items: {
          include: { product: true },
        },
      },
    });

    const totalRevenue = sales.reduce((acc, sale) => acc + sale.total, 0);
    const totalSales = sales.length;

    const paymentMethods = sales.flatMap((s) => s.payments).reduce((acc: any, p) => {
      acc[p.method] = (acc[p.method] || 0) + p.amount;
      return acc;
    }, {});

    const productSales = sales.flatMap((s) => s.items).reduce((acc: any, item) => {
      if (!acc[item.productId]) {
        acc[item.productId] = {
          name: item.productName || item.product?.name || 'Item',
          quantity: 0,
          revenue: 0,
        };
      }
      acc[item.productId].quantity += item.quantity;
      acc[item.productId].revenue += item.total;
      return acc;
    }, {});

    const topProducts = Object.values(productSales)
      .sort((a: any, b: any) => b.quantity - a.quantity)
      .slice(0, 10);

    res.json({
      totalRevenue,
      totalSales,
      paymentBreakdown: paymentMethods,
      topProducts,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar relatórios' });
  }
});

export default router;
