import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const results: string[] = [];

  // List all users first
  try {
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      results.push(`List error: ${listError.message}`);
    } else {
      results.push(`Found ${users?.users?.length || 0} users`);

      // Delete any maiyuribricks users
      for (const user of users?.users || []) {
        if (user.email?.includes('maiyuribricks.com')) {
          const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
          results.push(`Delete ${user.email}: ${delError?.message || 'success'}`);
        }
      }
    }
  } catch (e) {
    results.push(`List exception: ${e}`);
  }

  // Now create fresh users
  const usersToCreate = [
    { email: 'ram@maiyuribricks.com', name: 'Ram Kumaran', role: 'founder' },
    { email: 'kavitha@maiyuribricks.com', name: 'Kavitha', role: 'accountant' },
    { email: 'srinivasan@maiyuribricks.com', name: 'Srinivasan', role: 'engineer' },
  ];

  for (const userData of usersToCreate) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: 'TempPass123!',
        email_confirm: true,
        user_metadata: { name: userData.name }
      });

      if (error) {
        results.push(`Create ${userData.email}: ${error.message}`);
      } else {
        results.push(`Create ${userData.email}: success (${data.user.id})`);

        // Update public.users profile
        const { error: profileError } = await supabase
          .from('users')
          .upsert({
            id: data.user.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
          }, { onConflict: 'id' });

        if (profileError) {
          results.push(`Profile ${userData.email}: ${profileError.message}`);
        } else {
          results.push(`Profile ${userData.email}: success`);
        }
      }
    } catch (e) {
      results.push(`Exception ${userData.email}: ${e}`);
    }
  }

  return NextResponse.json({ results });
}
