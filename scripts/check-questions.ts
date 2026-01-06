
import { services } from '@maiyuri/api';

async function main() {
  console.log('Checking unanswered_questions...');
  try {
    const { data, error } = await services.supabase.supabase
      .from('unanswered_questions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
       console.error('Error:', error);
       return;
    }
    console.log(`Found ${data.length} records.`);
    console.log(JSON.stringify(data, null, 2));

  } catch (e) {
    console.error(e);
  }
}

main();
