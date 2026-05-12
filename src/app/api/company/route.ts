import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!userRecord?.company_id) return NextResponse.json(null);

  const { data } = await supabase
    .from('companies')
    .select('*')
    .eq('id', userRecord.company_id)
    .single();

  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const supabase = createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!userRecord?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 400 });
  }

  const body = await request.json();

  // Whitelist allowed fields — never pass raw body to DB
  const { error } = await supabase
    .from('companies')
    .update({
      name: body.name,
      contact_name: body.contact_name,
      contact_email: body.contact_email,
      contact_phone: body.contact_phone,
      address: body.address,
      cif: body.cif,
      logo_url: body.logo_url,
    })
    .eq('id', userRecord.company_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
