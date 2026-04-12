import { Request, Response, NextFunction } from 'express';

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) =>
        Promise.resolve(fn(req, res, next)).catch(next);

export const globalErrorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(`[ERROR] ${_req.method} ${_req.path}:`, err.message);

    if (err.name === 'ValidationError' || err.message.includes('invalid input')) {
        res.status(400).json({ error: err.message });
        return;
    }

    res.status(500).json({ error: 'Eroare de server. Vă rugăm încercați din nou.' });
};
