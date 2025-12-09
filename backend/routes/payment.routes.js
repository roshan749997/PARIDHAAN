import { Router } from 'express';
import { createPayUTxn, verifyPayUPayment, verifyPayment } from '../controllers/payment.controller.js';
import auth from '../middleware/auth.js';

const router = Router();

// PayU transaction creation
router.post('/payu/create', createPayUTxn);

// PayU callback (POST ONLY from PayU server for server-side verification - no auth required)
// PayU dashboard must be configured with: https://paridhaan-3.onrender.com/api/payment/payu/callback
// User redirects go directly to frontend URLs (surl/furl), NOT to this endpoint
router.post('/payu/callback', verifyPayUPayment);

// Legacy verify endpoint (for frontend to check after redirect)
router.post('/verify', auth, verifyPayment);

export default router;
