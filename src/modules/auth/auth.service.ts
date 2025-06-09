import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../common/services/supabase.service';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private supabaseService: SupabaseService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<string> {
    const { data: admin, error } = await this.supabaseService
      .getClient()
      .from('admins')
      .select('id, email, password_hash')
      .eq('email', email)
      .single();

    if (error || !admin) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
    if (!isPasswordValid) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const payload: JwtPayload = { sub: admin.id, email: admin.email, role: 'admin' };
    try {
      return await this.jwtService.signAsync(payload);
    } catch (error) {
      throw new HttpException('Failed to generate token: JWT_SECRET is not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}