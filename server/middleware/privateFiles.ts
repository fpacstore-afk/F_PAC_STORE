import type { RequestHandler } from 'express';

/** Backend artifacts and source maps are never storefront assets, even on the direct origin. */
export const denyPrivateFiles: RequestHandler = (req, res, next) => {
  let pathname: string;
  try { pathname = decodeURIComponent(req.path); }
  catch { return res.status(400).set('Cache-Control', 'no-store').end(); }
  if (pathname.split('/').some(part => /^\.(?:env(?:\..*)?|git|svn|hg)$/i.test(part)) ||
      /\.(?:cjs|map|pem|key|ts|tsx|jsx|sql|sqlite|db|bak)$/i.test(pathname) ||
      /^\/(?:build-server|node_modules|server|scripts)(?:\/|$)/i.test(pathname)) {
    return res.status(404).set('Cache-Control', 'no-store').end();
  }
  next();
};
