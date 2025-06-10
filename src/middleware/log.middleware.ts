import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SupabaseService } from '../common/services/supabase.service';

@Injectable()
export class LogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LogMiddleware.name);

  constructor(private supabaseService: SupabaseService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, baseUrl, path: rawPath, body } = req;
    // Fallback to baseUrl + rawPath or originalUrl
    let path = (baseUrl || '') + (rawPath || '');
    if (!path || path === '/') {
      path = originalUrl.split('?')[0]; // Use originalUrl without query params
    }
    // Normalize path: remove trailing slashes
    path = path.replace(/\/+$/, '');
    this.logger.debug(`Processing request: ${method} ${originalUrl} (baseUrl: ${baseUrl}, rawPath: ${rawPath}, normalized path: ${path})`);

    if (path.startsWith('/api/admin')) {
      const action = path.split('/').slice(0, 4).join('/'); // e.g., /api/admin/checkers
      const adminId = (req.user as any)?.id || process.env.ADMIN_ID || 'default_admin';
      this.logger.debug(`Attempting to log: action=${action}, admin_id=${adminId}, user=${JSON.stringify(req.user || {})}`);

      try {
        const { data, error } = await this.supabaseService.getClient().from('logs').insert([
          {
            action,
            admin_id: adminId,
            details: { method, path: originalUrl, body },
          },
        ]).select();

        if (error) {
          this.logger.error(`Supabase insert error: ${JSON.stringify(error, null, 2)}`);
        } else {
          this.logger.debug(`Successfully logged: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        this.logger.error(`Unexpected error in logging: ${err.message}\nStack: ${err.stack}`);
      }
    } else {
      this.logger.debug(`Skipping logging for non-admin path: ${path}`);
    }

    next();
  }
}