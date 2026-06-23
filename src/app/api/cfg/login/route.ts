import { NextRequest, NextResponse } from 'next/server';

const ADMIN_USER = 'adminmmb';
const ADMIN_PASS = '16081020';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const res = NextResponse.json({ success: true });
      // Set cookie — 24h
      res.cookies.set('cfg_token', 'authenticated', {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      });
      return res;
    }
    return NextResponse.json({ success: false, error: 'Sai tài khoản hoặc mật khẩu' }, { status: 401 });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
