// optional-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override canActivate to make authentication optional
  canActivate(context: ExecutionContext) {
    // Add your custom authentication logic here
    return super.canActivate(context);
  }

  // Override handleRequest to not throw an error when no user is found
  handleRequest(err, user, info) {
    // You can throw an exception based on either "info" or "err" arguments
    // Don't throw error if no user - just return null
    return user || null;
  }
}