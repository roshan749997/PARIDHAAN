import { Product } from '../models/product.js';

const CATEGORY_GROUPS = {
  'Designer Sarees': [
    'Party Wear Saree',
    'Wedding Sarees',
    'Festive Sarees',
    'Bollywood Style Sarees',
    'Heavy Embroidered Sarees'
  ]
};

export const getProducts = async (req, res) => {
  try {
    // Accept either `subcategory` (preferred) or `category` query param
    const rawCategory = (req.query.subcategory || req.query.category || '').toString();
    // normalize slug-like values (e.g., "soft-silk" -> "soft silk") and trim
    const category = rawCategory.replace(/-/g, ' ').trim();
    let query = {};

    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Received request with query params:', req.query);
    }

    if (category) {
      // Try multiple ways to match the category or subcategory fields
      const re = new RegExp(category, 'i');
      const orConditions = [
        { 'category.name': { $regex: re } },
        { 'category': { $regex: re } },
        { 'category.slug': { $regex: re } },
        { 'subcategory': { $regex: re } },
        { 'tags': { $regex: re } }
      ];

      if (CATEGORY_GROUPS[category]) {
        CATEGORY_GROUPS[category].forEach((sub) => {
          orConditions.push({ category: { $regex: new RegExp(sub, 'i') } });
        });
      }

      query = { $or: orConditions };

      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('Search query:', JSON.stringify(query, null, 2));
      }
    }

    // Execute the query directly (removed unnecessary allProducts query for performance)
    // Use lean() for better performance - returns plain JS objects instead of Mongoose documents
    // Select only needed fields to reduce response size and improve performance
    let products = await Product.find(query)
      .select('title mrp discountPercent description category categoryId product_info images createdAt updatedAt')
      .lean();
    
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(`Found ${products.length} matching products`);
    }

    // Process image URLs to ensure they're absolute (only if needed)
    // Skip processing if BASE_URL is not set (assumes URLs are already absolute)
    const baseUrl = process.env.BASE_URL;
    if (baseUrl) {
      products = products.map(product => {
        // Handle both array and object image formats
        if (product.images) {
          if (Array.isArray(product.images)) {
            product.images = product.images.map(img => {
              if (img && img.url && !img.url.startsWith('http')) {
                return {
                  ...img,
                  url: img.url.startsWith('/') ? `${baseUrl}${img.url}` : `${baseUrl}/${img.url}`
                };
              }
              return img;
            });
          } else {
            // Handle object format: { image1: 'url', image2: 'url', ... }
            Object.keys(product.images).forEach(key => {
              const imgUrl = product.images[key];
              if (imgUrl && typeof imgUrl === 'string' && !imgUrl.startsWith('http')) {
                product.images[key] = imgUrl.startsWith('/') 
                  ? `${baseUrl}${imgUrl}` 
                  : `${baseUrl}/${imgUrl}`;
              }
            });
          }
        }
        return product;
      });
    }
    
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      message: 'Error fetching products', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    // Use lean() for better performance
    // Select all fields for product detail page (needs full info)
    let product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Process image URLs to ensure they're absolute (only if BASE_URL is set)
    const baseUrl = process.env.BASE_URL;
    if (baseUrl && product.images) {
      if (Array.isArray(product.images)) {
        product.images = product.images.map(img => {
          if (img && img.url && !img.url.startsWith('http')) {
            return {
              ...img,
              url: img.url.startsWith('/') ? `${baseUrl}${img.url}` : `${baseUrl}/${img.url}`
            };
          }
          return img;
        });
      } else {
        // Handle object format: { image1: 'url', image2: 'url', ... }
        Object.keys(product.images).forEach(key => {
          const imgUrl = product.images[key];
          if (imgUrl && typeof imgUrl === 'string' && !imgUrl.startsWith('http')) {
            product.images[key] = imgUrl.startsWith('/') 
              ? `${baseUrl}${imgUrl}` 
              : `${baseUrl}/${imgUrl}`;
          }
        });
      }
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ 
      message: 'Error fetching product', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
