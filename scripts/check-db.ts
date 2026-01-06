
import { services } from '@maiyuri/api';

async function main() {
  console.log('--- Unanswered Questions ---');
  const { data: q } = await services.supabase.supabase.from('unanswered_questions').select('*');
  console.log(q);

  console.log('--- Tasks ---');
  const { data: t } = await services.supabase.supabase.from('tasks').select('*');
  console.log(t);
}

main();
