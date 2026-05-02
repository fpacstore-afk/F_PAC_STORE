import { Link } from 'react-router-dom';
import { products } from '../data/products';
import { motion } from 'motion/react';

export function Catalog() {
  return (
    <div className="min-h-screen pt-32 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-black uppercase tracking-tighter mb-4">
          PRODUTOS
        </h1>
        <p className="text-gray-600 text-lg">A coleção completa. Escolha sua armadura diária.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {products.map((product, i) => (
          <motion.div 
            key={product.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="group relative flex flex-col"
          >
            <Link to={`/product/${product.slug}`} className="block relative aspect-[3/4] overflow-hidden rounded-none bg-black/5 mb-4">
              {product.isNew && (
                  <span className="absolute top-4 left-4 z-10 bg-[#eab308] text-black text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-sm">
                    Novo
                  </span>
              )}
              {product.isBestseller && (
                  <span className="absolute top-4 left-4 z-10 bg-white text-black text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-sm">
                    + Vendido
                  </span>
              )}
              <img 
                  src={product.images[0]} 
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </Link>

            <div>
              <h3 className="font-bold text-lg">{product.name}</h3>
              <p className="text-gray-600 text-sm mb-2">{product.headline}</p>
              <div className="flex justify-between items-center">
                  <span className="font-bold">R$ {product.price.toFixed(2)}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
