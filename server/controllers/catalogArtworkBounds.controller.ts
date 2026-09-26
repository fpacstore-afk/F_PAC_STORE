import type { Request, Response } from 'express';
import { getCatalogArtworkBounds } from '../services/catalogArtworkBounds.service.js';

export async function readCatalogArtworkBounds(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  try { return res.json(await getCatalogArtworkBounds(String(req.params.id))); }
  catch (error: any) { return res.status(error.status || 422).json({ message: error.status ? error.message : 'Não foi possível medir esta arte. Tente novamente em instantes.' }); }
}
