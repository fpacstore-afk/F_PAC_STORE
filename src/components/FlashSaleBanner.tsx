import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Clock, X } from 'lucide-react';
import { getFlashSaleInfo, FlashSaleInfo } from '../lib/flashSale';

// Removed as requested to leave only one notice (FlashSaleBadge is used instead)
export const FlashSaleBanner: React.FC = () => {
  return null;
};
