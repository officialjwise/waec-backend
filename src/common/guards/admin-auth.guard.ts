import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const expectedApiKey = process.env.ADMIN_API_KEY;
    console.log(`AdminAuthGuard: path=${request.path}, user=${JSON.stringify(request.user || {})}`);

    if (apiKey && apiKey === expectedApiKey) {
      request.user = { id: process.env.ADMIN_ID };
      console.log(`AdminAuthGuard: Set user=${JSON.stringify(request.user)}`);
      return true;
    }

    if (request.path === '/api/auth/login') {
      console.log('AdminAuthGuard: Allowing JWT for login endpoint');
      return true;
    }

    console.log('AdminAuthGuard: Throwing UnauthorizedException');
    throw new UnauthorizedException('Invalid API key');
  }
}