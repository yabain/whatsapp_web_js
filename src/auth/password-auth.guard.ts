import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class PasswordAuthGuard implements CanActivate {
  private readonly password = process.env.WHATSAPP_GATEWAY_PASSWORD;

  canActivate(context: ExecutionContext): boolean {
    if (!this.password) {
      throw new Error('WHATSAPP_GATEWAY_PASSWORD is not defined in environment variables');
    }

    const request = context.switchToHttp().getRequest();
    const headerPassword = request.headers['x-whatsapp-password'];
    const bearer = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const password = Array.isArray(headerPassword) ? headerPassword[0] : headerPassword;

    if (password === this.password || bearer === this.password) return true;
    throw new UnauthorizedException('Invalid WhatsApp gateway password');
  }
}
