import crypto from 'crypto';
import Cart from '../models/Cart.js';
import Order from '../models/Order.js';
import { Address } from '../models/Address.js';

/**
 * PayU LIVE Integration - Production Configuration
 * 
 * IMPORTANT: Configure these URLs in your PayU Merchant Dashboard:
 * 
 * Success URL: https://paridhaan-4.onrender.com/payment-success
 * Fail URL:    https://paridhaan-4.onrender.com/payment-fail
 * Callback:    https://paridhaan-3.onrender.com/api/payment/payu/callback
 * 
 * Payment Flow:
 * 1. User initiates payment → Frontend submits form to https://secure.payu.in/_payment
 * 2. PayU processes payment → Sends POST callback to backend /api/payment/payu/callback
 * 3. Backend verifies payment → Creates order → Returns 200 OK to PayU
 * 4. PayU redirects user → Frontend /payment-success or /payment-fail (GET redirect)
 * 
 * Environment Variables Required:
 * - PAYU_KEY: Your PayU merchant key
 * - PAYU_SALT: Your PayU merchant salt
 * - PAYU_SUCCESS_URL: https://paridhaan-4.onrender.com/payment-success
 * - PAYU_FAIL_URL: https://paridhaan-4.onrender.com/payment-fail
 * - PAYU_CALLBACK_URL: https://paridhaan-3.onrender.com/api/payment/payu/callback (optional, auto-generated)
 * - FRONTEND_URL: https://paridhaan-4.onrender.com
 * - BACKEND_URL: https://paridhaan-3.onrender.com
 */

// PayU transaction creation
export const createPayUTxn = async (req, res) => {
  try {
    const { amount, name, email, phone } = req.body;
    
    // Validate required fields with detailed error messages
    const missingFields = [];
    if (!amount && amount !== 0) missingFields.push('amount');
    if (!name || !name.trim()) missingFields.push('name');
    if (!email || !email.trim()) missingFields.push('email');
    if (!phone || !phone.trim()) missingFields.push('phone');
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: `Missing required fields: ${missingFields.join(', ')}`,
        received: { amount, name, email, phone }
      });
    }

    const rupees = Number(amount);
    if (!rupees || Number.isNaN(rupees) || rupees <= 0) {
      return res.status(400).json({ error: `Invalid amount: ${amount}` });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Validate phone (should be 10 digits for Indian numbers)
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone.trim())) {
      return res.status(400).json({ error: 'Phone number must be 10 digits' });
    }

    const key = process.env.PAYU_KEY;
    let salt = process.env.PAYU_SALT;

    if (!key || !salt) {
      return res.status(500).json({ error: 'PayU keys not configured on server' });
    }

    // Validate and fix SALT value (common typo: lowercase 'l' vs capital 'I')
    // PayU test SALT should end with 'KI3jCjk0' (capital I), not 'Kl3jCjk0' (lowercase l)
    if (salt.includes('Kl3jCjk0')) {
      console.warn('⚠️  WARNING: SALT value has lowercase "l" - should be capital "I"');
      console.warn('⚠️  Current SALT:', salt);
      console.warn('⚠️  Expected SALT should end with: KI3jCjk0 (capital I)');
      salt = salt.replace('Kl3jCjk0', 'KI3jCjk0');
      console.warn('⚠️  Auto-corrected SALT to:', salt);
    }

    const txnid = 'txn' + Date.now();
    const productinfo = 'Order';

    // PayU hash string format: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
    // Exactly 11 pipes between email and SALT
    // Ensure amount is string (no decimal conversion) and trim all values
    const amountStr = String(amount).trim();
    const firstname = name.trim();
    const emailTrimmed = email.trim();
    
    // Build hash string exactly as PayU requires
    const hashString = `${key}|${txnid}|${amountStr}|${productinfo}|${firstname}|${emailTrimmed}|||||||||||${salt}`;
    
    // Debug logging (remove in production)
    console.log('PayU Hash Debug:', {
      key,
      txnid,
      amount: amountStr,
      productinfo,
      firstname,
      email: emailTrimmed,
      salt,
      hashStringLength: hashString.length,
      pipesAfterEmail: (hashString.match(/\|/g) || []).length - 5
    });
    
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    // PayU Success and Fail URLs (where PayU redirects user after payment)
    // These MUST be frontend URLs as PayU redirects users here via GET
    // Production: https://paridhaan-4.onrender.com/payment-success
    // Production: https://paridhaan-4.onrender.com/payment-fail
    const surl = process.env.PAYU_SUCCESS_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-success`;
    const furl = process.env.PAYU_FAIL_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-fail`;

    // PayU Callback URL (where PayU sends POST for server-side verification)
    // This is configured in PayU dashboard and used server-side only
    // Production: https://paridhaan-3.onrender.com/api/payment/payu/callback
    // Note: Callback URL is NOT sent to frontend, only used in PayU dashboard configuration
    const callbackUrl = process.env.PAYU_CALLBACK_URL || `${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 7000}`}/api/payment/payu/callback`;

    // Store txnid -> userId mapping if userId is available (from optional auth)
    // This helps us find the user during callback when PayU sends POST
    const userId = req.userId || null;
    if (userId) {
      console.log('PayU transaction created for userId:', userId, 'txnid:', txnid);
    }

    return res.json({
      key,
      txnid,
      amount,
      productinfo,
      firstname: name,
      email,
      phone,
      hash,
      // PayU surl/furl - Frontend URLs where PayU redirects user after payment (GET redirect)
      // These are sent to PayU in the payment form
      surl,
      furl,
    });
  } catch (err) {
    console.error('createPayUTxn err', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// PayU payment verification (called by PayU via POST callback for server-side verification)
// This endpoint ONLY handles POST requests from PayU server
// PayU dashboard must be configured with: https://paridhaan-3.onrender.com/api/payment/payu/callback
// User redirects go directly to frontend URLs (surl/furl) - NOT to this endpoint
export const verifyPayUPayment = async (req, res) => {
  try {
    // This endpoint should ONLY receive POST requests from PayU server
    if (req.method !== 'POST') {
      console.warn('PayU callback: Received non-POST request, ignoring');
      return res.status(405).json({ error: 'Method not allowed. This endpoint only accepts POST from PayU server.' });
    }

    // Get data from POST body (PayU server callback)
    const {
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      status,
      hash,
      key,
      // Additional PayU response fields
      mihpayid,
      bank_ref_num,
      error,
      error_Message,
    } = req.body;

    // Frontend redirect URLs (for reference, but user is already redirected by PayU)
    const frontendSuccessUrl = process.env.PAYU_SUCCESS_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-success`;
    const frontendFailUrl = process.env.PAYU_FAIL_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-fail`;

    // Validate required fields for POST callback
    if (!txnid || !amount || !hash) {
      console.error('PayU POST callback: Missing required fields');
      return res.status(400).json({ error: 'Missing required fields from PayU callback' });
    }

    const salt = process.env.PAYU_SALT;
    const payuKey = process.env.PAYU_KEY;

    if (!salt || !payuKey) {
      console.error('PayU POST callback: Server secret missing');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify hash: key|txnid|amount|productinfo|firstname|email|status|||||||||||salt
    const hashString = `${payuKey}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${status}|||||||||||${salt}`;
    const expectedHash = crypto.createHash('sha512').update(hashString).digest('hex');

    if (expectedHash !== hash) {
      console.error('PayU hash verification failed');
      return res.status(400).json({ error: 'Invalid hash verification' });
    }

    // Hash verified - payment is legitimate
    const isSuccess = status === 'success';

    if (isSuccess) {
        // Try to find user by email (PayU provides email in callback)
        // We need to find the user who initiated this transaction
        // Option 1: Store txnid -> userId mapping before redirect (better approach)
        // Option 2: Find user by email (less reliable if multiple users have same email)
        // For now, we'll try to find user by email and create order if found
        try {
          const User = (await import('../models/User.js')).default;
          const user = await User.findOne({ email: email?.trim() });
          
          if (user) {
            const userId = String(user._id);
            
            // Create order from cart items
            const cart = await Cart.findOne({ user: userId }).populate('items.product');
            if (cart && Array.isArray(cart.items) && cart.items.length > 0) {
              const items = cart.items.map(i => {
                const p = i.product;
                let base = 0;
                if (p && typeof p.price === 'number') {
                  base = Number(p.price) || 0;
                } else {
                  const mrp = Number(p?.mrp) || 0;
                  const discountPercent = Number(p?.discountPercent) || 0;
                  base = Math.round(mrp - (mrp * discountPercent) / 100) || 0;
                }
                return { product: p._id, quantity: i.quantity, price: base };
              });
              const orderAmount = items.reduce((sum, it) => sum + (it.price * it.quantity), 0);

              // Load user's current address
              let shippingAddress = null;
              try {
                const addr = await Address.findOne({ userId });
                if (addr) {
                  const { fullName, mobileNumber, pincode, locality, address, city, state, landmark, alternatePhone, addressType } = addr;
                  shippingAddress = { fullName, mobileNumber, pincode, locality, address, city, state, landmark, alternatePhone, addressType };
                }
              } catch {}

              // Check if order already exists (avoid duplicates)
              const existingOrder = await Order.findOne({ payuTxnId: txnid });
              if (!existingOrder) {
                const order = await Order.create({
                  user: userId,
                  items,
                  amount: orderAmount,
                  currency: 'INR',
                  status: 'paid',
                  payuTxnId: txnid,
                  payuPaymentId: mihpayid || bank_ref_num,
                  payuHash: hash,
                  shippingAddress,
                });

                cart.items = [];
                await cart.save();
                
                console.log('PayU POST callback: Order created successfully', order._id);
              } else {
                console.log('PayU POST callback: Order already exists for txnid', txnid);
              }
            }
          } else {
            console.warn('PayU POST callback: User not found for email', email);
          }
        } catch (orderErr) {
          console.error('PayU POST callback: Error creating order', orderErr);
          // Log error but still return success to PayU (order can be created later via frontend verification)
        }
      }

    // Return success response to PayU server (PayU expects 200 OK)
    // User is already redirected to frontend by PayU, so we don't redirect here
    return res.status(200).json({ 
      success: true, 
      message: 'Payment callback processed',
      txnid,
      status 
    });
  } catch (err) {
    console.error('PayU verifyPayment error:', err?.message || err);
    // Return error to PayU but don't redirect (user already redirected by PayU)
    return res.status(500).json({ error: 'Verification failed', txnid: req.body?.txnid || 'unknown' });
  }
};

// Legacy verifyPayment endpoint (for backward compatibility, but now handles PayU)
// This can be called from frontend after redirect
export const verifyPayment = async (req, res) => {
  try {
    const { txnid } = req.body || {};
    if (!txnid) {
      return res.status(400).json({ error: 'Missing txnid' });
    }

    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Check if order already exists with this txnid
    const existingOrder = await Order.findOne({ payuTxnId: txnid, user: userId });
    if (existingOrder) {
      return res.json({ success: true, order: existingOrder });
    }

    // If order doesn't exist, create it (this handles the case where PayU callback didn't create order)
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const items = cart.items.map(i => {
      const p = i.product;
      let base = 0;
      if (p && typeof p.price === 'number') {
        base = Number(p.price) || 0;
      } else {
        const mrp = Number(p?.mrp) || 0;
        const discountPercent = Number(p?.discountPercent) || 0;
        base = Math.round(mrp - (mrp * discountPercent) / 100) || 0;
      }
      return { product: p._id, quantity: i.quantity, price: base };
    });
    const amount = items.reduce((sum, it) => sum + (it.price * it.quantity), 0);

    let shippingAddress = null;
    try {
      const addr = await Address.findOne({ userId });
      if (addr) {
        const { fullName, mobileNumber, pincode, locality, address, city, state, landmark, alternatePhone, addressType } = addr;
        shippingAddress = { fullName, mobileNumber, pincode, locality, address, city, state, landmark, alternatePhone, addressType };
      }
    } catch {}

    const order = await Order.create({
      user: userId,
      items,
      amount,
      currency: 'INR',
      status: 'paid',
      payuTxnId: txnid,
      shippingAddress,
    });

    cart.items = [];
    await cart.save();

    return res.json({ success: true, order });
  } catch (err) {
    console.error('verifyPayment error:', err?.message || err);
    return res.status(500).json({ error: 'Verification failed' });
  }
};
