import { NextRequest, NextResponse } from 'next/server';
import {
  createAuthToken,
  cookieOptions,
  COOKIE_NAME,
  checkLoginAttempt,
  recordLoginFailure,
  clearLoginAttempts,
} from '@/lib/auth';

const ADMIN_USER = process.env.CFG_ADMIN_USER;
const ADMIN_PASS = process.env.CFG_ADMIN_PASS;

if (process.env.NODE_ENV === 'production' && (!ADMIN_USER || !ADMIN_PASS)) {
  throw new Error('Thiếu biến môi trường CFG_ADMIN_USER hoặc CFG_ADMIN_PASS trên Production');
}

export async function POST(req: NextRequest) {
  try {
    // Dùng header x-forwarded-for (Vercel tự động cung cấp header này)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    
    // Brute force protection (async từ DB)
    const { allowed, remaining } = await checkLoginAttempt(ip);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: `Quá nhiều lần thử. Vui lòng chờ ${remaining} giây.` },
        { status: 429 }
      );
    }

    const { username, password } = await req.json();

    // Fallback cho local dev nếu chưa có biến môi trường
    const expectedUser = ADMIN_USER || 'adminmmb';
    const expectedPass = ADMIN_PASS || '16081020';

    if (username === expectedUser && password === expectedPass) {
      await clearLoginAttempts(ip);
      const token = await createAuthToken();
      const res = NextResponse.json({ success: true });
      res.cookies.set(COOKIE_NAME, token, cookieOptions(60 * 60 * 24)); // 24h
      return res;
    }

    await recordLoginFailure(ip);
    return NextResponse.json(
      { success: false, error: 'Sai tài khoản hoặc mật khẩu' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
