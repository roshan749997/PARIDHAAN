import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyPayment } from '../services/api';
import { useCart } from '../context/CartContext';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loadCart } = useCart();
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const verify = async () => {
      // PayU sends txnid and status in URL params
      const txnid = searchParams.get('txnid');
      const status = searchParams.get('status');
      
      console.log('Payment Success - URL params:', {
        txnid,
        status,
        allParams: Object.fromEntries(searchParams.entries())
      });

      // If txnid exists, try to verify
      if (txnid) {
        try {
          const result = await verifyPayment({ txnid });
          if (result && result.success) {
            await loadCart();
            // Redirect after short delay
            setTimeout(() => {
              navigate('/profile?tab=orders', { replace: true });
            }, 1500);
          } else {
            setError('Payment verification failed, but redirecting...');
            // Still redirect even if verification fails
            setTimeout(() => {
              navigate('/profile?tab=orders', { replace: true });
            }, 2500);
          }
        } catch (e) {
          console.error('Verification error:', e);
          setError('Payment verification failed, but redirecting...');
          // Redirect even on error
          setTimeout(() => {
            navigate('/profile?tab=orders', { replace: true });
          }, 2500);
        } finally {
          setVerifying(false);
        }
      } else {
        // No txnid - still redirect to profile
        setError('Transaction ID not found');
        setVerifying(false);
        setTimeout(() => {
          navigate('/profile?tab=orders', { replace: true });
        }, 2000);
      }
    };

    verify();
  }, [searchParams, navigate, loadCart]);

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying payment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Payment Verification Failed</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/profile?tab=orders')}
            className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            Go to Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Payment Successful!</h2>
        <p className="text-gray-600 mb-6">Your order has been confirmed. Redirecting to orders page...</p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto mb-4"></div>
        <p className="text-sm text-gray-500">If not redirected automatically, <button onClick={() => navigate('/profile?tab=orders', { replace: true })} className="text-amber-600 hover:underline">click here</button></p>
      </div>
    </div>
  );
};

export default PaymentSuccess;

