/**
 * Auth helper — JWT-based authentication cho admin routes
 */

import { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { supabaseAdmin } from './supabase';

const JWT_SECRET_RAW = process.env.JWT_SECRET;

// Bắt buộc cấu hình JWT_SECRET trên production
if (process.env.NODE_ENV === 'production' && !JWT_SECRET_RAW) {
  throw new Error('Thiếu biến môi trường JWT_SECRET trên Production');
}

const fallbackSecret = 'tdc-chatbot-dev-secret-please-change-in-production-32chars';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW || fallbackSecret);
export const COOKIE_NAME = 'cfg_token';
const TOKEN_EXPIRY = '24h';

/** Tạo JWT token sau khi đăng nhập thành công */
export async function createAuthToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

/** Xác thực JWT từ cookie — trả về true nếu hợp lệ và chưa hết hạn */
export async function checkAuth(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    // Token hết hạn hoặc chữ ký sai
    return false;
  }
}

/** Cookie options chuẩn */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production', // ✅ HTTPS-only trên production
    maxAge,
    path: '/',
  };
}

// ── Brute Force Protection (via Supabase) ──────────────────────────────────
// Theo dõi số lần đăng nhập sai theo IP, khóa sau 5 lần sai trong 15 phút

export async function checkLoginAttempt(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('login_attempts')
      .select('*')
      .eq('ip_address', ip)
      .maybeSingle();

    if (error) {
      console.error('[Auth] Lỗi check DB rate limit:', error);
      return { allowed: true, remaining: 0 }; // Fail open nếu lỗi DB
    }

    if (data && data.locked_until) {
      const lockedUntil = new Date(data.locked_until).getTime();
      const now = Date.now();
      if (now < lockedUntil) {
        return { allowed: false, remaining: Math.ceil((lockedUntil - now) / 1000) };
      }
    }
    return { allowed: true, remaining: 0 };
  } catch (e) {
    console.error('[Auth] Lỗi check rate limit:', e);
    return { allowed: true, remaining: 0 };
  }
}

export async function recordLoginFailure(ip: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('login_attempts')
      .select('*')
      .eq('ip_address', ip)
      .maybeSingle();

    const now = Date.now();
    let count = 1;
    let lockedUntil = null;

    if (data) {
      const prevLockedUntil = data.locked_until ? new Date(data.locked_until).getTime() : 0;
      // Nếu đã qua 15 phút kể từ lần khóa trước thì reset count
      count = (now < prevLockedUntil + 15 * 60 * 1000 ? data.attempts : 0) + 1;
    }

    if (count >= 5) {
      lockedUntil = new Date(now + 15 * 60 * 1000).toISOString(); // khóa 15 phút
    }

    await supabaseAdmin
      .from('login_attempts')
      .upsert({
        ip_address: ip,
        attempts: count,
        locked_until: lockedUntil
      }, { onConflict: 'ip_address' });

  } catch (e) {
    console.error('[Auth] Lỗi record fail:', e);
  }
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('login_attempts')
      .delete()
      .eq('ip_address', ip);
  } catch (e) {
    console.error('[Auth] Lỗi clear rate limit:', e);
  }
}
