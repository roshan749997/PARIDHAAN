import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaRupeeSign, FaHeart, FaRegHeart } from 'react-icons/fa';
import { fetchSarees } from '../services/api';

const BestSellers = () => {
  const [products, setProducts] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const data = await fetchSarees('');
        // Filter products with discounts and take first 4
        const productsWithDiscount = data
          .filter(p => (p.discountPercent > 0 || p.discount > 0) && p.images?.image1)
          .slice(0, 4);
        
        // If we don't have 4 with discounts, fill with regular products
        if (productsWithDiscount.length < 4) {
          const regularProducts = data
            .filter(p => p.images?.image1 && !productsWithDiscount.find(prod => prod._id === p._id))
            .slice(0, 4 - productsWithDiscount.length);
          setProducts([...productsWithDiscount, ...regularProducts].slice(0, 4));
        } else {
          setProducts(productsWithDiscount);
        }
      } catch (error) {
        console.error('Error loading best sellers:', error);
      }
    };

    loadProducts();
    
    // Load wishlist from localStorage
    try {
      const saved = localStorage.getItem('wishlist');
      if (saved) {
        setWishlist(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading wishlist:', e);
    }
  }, []);

  const toggleWishlist = (productId, e) => {
    e.stopPropagation();
    try {
      const saved = localStorage.getItem('wishlist');
      let items = saved ? JSON.parse(saved) : [];
      
      if (items.includes(productId)) {
        items = items.filter(id => id !== productId);
      } else {
        items.push(productId);
      }
      
      localStorage.setItem('wishlist', JSON.stringify(items));
      setWishlist(items);
    } catch (e) {
      console.error('Error updating wishlist:', e);
    }
  };

  const calculatePrice = (product) => {
    if (product.price) return product.price;
    if (product.mrp && product.discountPercent) {
      return Math.round(product.mrp - (product.mrp * product.discountPercent / 100));
    }
    return product.mrp || 0;
  };

  const calculateDiscount = (product) => {
    if (product.discountPercent) return product.discountPercent;
    if (product.discount) return product.discount;
    if (product.mrp && product.price) {
      return Math.round(((product.mrp - product.price) / product.mrp) * 100);
    }
    return 0;
  };

  const handleProductClick = (product) => {
    navigate(`/product/${product._id}`);
  };

  if (products.length === 0) {
    return null;
  }

  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-5xl md:text-6xl font-serif text-gray-800 mb-3 tracking-wide" style={{ fontFamily: 'serif' }}>
            Best-sellers
          </h2>
          <p className="text-base md:text-lg text-gray-600 font-light">
            Styled for All!
          </p>
        </div>

        {/* Product Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => {
            const price = calculatePrice(product);
            const mrp = product.mrp || 0;
            const discount = calculateDiscount(product);
            const isWishlisted = wishlist.includes(product._id);

            return (
              <div
                key={product._id}
                className="group bg-white overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100"
                onClick={() => handleProductClick(product)}
              >
                {/* Image Container */}
                <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
                  <img
                    src={product.images?.image1 || 'https://via.placeholder.com/300x400?text=Image+Not+Available'}
                    alt={product.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://via.placeholder.com/300x400?text=Image+Not+Available';
                    }}
                  />
                  
                  {/* Sale Tag */}
                  {discount > 0 && (
                    <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-2.5 py-1">
                      Sale
                    </div>
                  )}
                  
                  {/* Heart Icon */}
                  <button
                    onClick={(e) => toggleWishlist(product._id, e)}
                    className="absolute top-3 right-3 bg-white rounded-full p-2 shadow-sm hover:shadow-md transition-all z-10"
                  >
                    {isWishlisted ? (
                      <FaHeart className="text-red-500 w-4 h-4" />
                    ) : (
                      <FaRegHeart className="text-gray-700 w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Product Info */}
                <div className="p-4 bg-white">
                  <h3 className="text-sm font-medium text-gray-800 mb-2 line-clamp-2 min-h-[2.5rem]">
                    {product.title || 'Untitled Product'}
                  </h3>
                  
                  {/* Price Section */}
                  <div className="mb-2">
                    <div className="flex items-baseline gap-2 mb-1">
                      <div className="flex items-center">
                        <FaRupeeSign className="h-3.5 w-3.5 text-gray-900" />
                        <span className="text-lg font-bold text-gray-900">
                          {price.toLocaleString('en-IN')}
                        </span>
                      </div>
                      {mrp > price && (
                        <span className="text-sm text-gray-400 line-through">
                          ₹{mrp.toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                    {discount > 0 && (
                      <span className="text-sm font-semibold text-green-600">
                        {discount}% OFF
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination Dots */}
        <div className="flex justify-center gap-2 mt-10">
          <div className="w-8 h-1.5 rounded-full bg-gray-300"></div>
          <div className="w-8 h-1.5 rounded-full bg-pink-400"></div>
          <div className="w-8 h-1.5 rounded-full bg-gray-300"></div>
        </div>
      </div>
    </section>
  );
};

export default BestSellers;

