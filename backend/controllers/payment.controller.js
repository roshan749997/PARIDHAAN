import crypto from 'crypto';
import Cart from '../models/Cart.js';
import Order from '../models/Order.js';
import { Address } from '../models/Address.js';

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

    // Backend callback URLs (PayU sends POST here first, then redirects user via GET)
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 7000}`;
    const callbackSuccessUrl = process.env.PAYU_CALLBACK_SUCCESS_URL || `${BACKEND_URL}/api/payment/payu/callback?status=success`;
    const callbackFailUrl = process.env.PAYU_CALLBACK_FAIL_URL || `${BACKEND_URL}/api/payment/payu/callback?status=fail`;

    // Frontend redirect URLs (where user is redirected after backend processes POST)
    const frontendSuccessUrl = process.env.PAYU_SUCCESS_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-success`;
    const frontendFailUrl = process.env.PAYU_FAIL_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-fail`;

    // Store txnid -> userId mapping if userId is available (from optional auth)
    // This helps us find the user during callback when PayU sends POST
    const userId = req.userId || null;
    if (userId) {
      // Store mapping in a simple in-memory cache or you could use Redis/DB
      // For now, we'll rely on email lookup in callback, but this could be improved
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
      // PayU surl/furl receive POST callbacks, then redirect user via GET
      // Set to backend callback URLs - backend will handle POST and redirect to frontend
      surl: callbackSuccessUrl,
      furl: callbackFailUrl,
      // Store frontend URLs for redirect after POST processing
      frontendSuccessUrl,
      frontendFailUrl,
    });
  } catch (err) {
    console.error('createPayUTxn err', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// PayU payment verification (called by PayU via POST on success/failure, then user redirected via GET)
// This endpoint handles both POST (PayU server callback) and GET (user browser redirect)
export const verifyPayUPayment = async (req, res) => {
  try {
    // Get data from POST body (PayU server callback) or query params (user redirect)
    const isPost = req.method === 'POST';
    const dataSource = isPost ? req.body : req.query;
    
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
    } = dataSource;

    // Frontend redirect URLs
    const frontendSuccessUrl = process.env.PAYU_SUCCESS_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-success`;
    const frontendFailUrl = process.env.PAYU_FAIL_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-fail`;

    // If GET request without required data, redirect to fail page
    if (!isPost && (!txnid || !status)) {
      console.warn('PayU callback: GET request without required data, redirecting to fail');
      return res.redirect(`${frontendFailUrl}?error=Invalid callback data`);
    }

    // For POST requests (PayU server callback), verify and process payment
    if (isPost) {
      if (!txnid || !amount || !hash) {
        console.error('PayU POST callback: Missing required fields');
        // Still redirect user to fail page
        return res.redirect(`${frontendFailUrl}?error=Missing required fields`);
      }

      const salt = process.env.PAYU_SALT;
      const payuKey = process.env.PAYU_KEY;

      if (!salt || !payuKey) {
        console.error('PayU POST callback: Server secret missing');
        return res.redirect(`${frontendFailUrl}?error=Server configuration error`);
      }

      // Verify hash: key|txnid|amount|productinfo|firstname|email|status|||||||||||salt
      const hashString = `${payuKey}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${status}|||||||||||${salt}`;
      const expectedHash = crypto.createHash('sha512').update(hashString).digest('hex');

      if (expectedHash !== hash) {
        console.error('PayU hash verification failed');
        return res.redirect(`${frontendFailUrl}?error=Invalid hash verification`);
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
          // Continue to redirect even if order creation fails
        }
      }
    }

    // After processing POST (or for GET requests), redirect user to frontend
    // Build redirect URL with transaction details
    const redirectUrl = status === 'success' 
      ? `${frontendSuccessUrl}?txnid=${txnid}&status=${status}${mihpayid ? `&mihpayid=${mihpayid}` : ''}`
      : `${frontendFailUrl}?txnid=${txnid || ''}&status=${status || 'failed'}${error_Message ? `&error=${encodeURIComponent(error_Message)}` : error ? `&error=${encodeURIComponent(error)}` : ''}`;

    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('PayU verifyPayment error:', err?.message || err);
    const frontendFailUrl = process.env.PAYU_FAIL_URL || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/payment-fail`;
    return res.redirect(`${frontendFailUrl}?error=Verification failed`);
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
