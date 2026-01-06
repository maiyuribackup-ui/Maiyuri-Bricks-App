import { open } from 'sqlite3'; // Not using sqlite, but just import
import { services } from '@maiyuri/api';

async function main() {
  console.log('Checking tasks...');
  try {
    const { data: tasks, error } = await services.supabase.supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tasks:', error);
      return;
    }

    console.log(`Found ${tasks.length} tasks.`);
    tasks.forEach(t => {
      console.log(`- [${t.status}] ${t.title} (ID: ${t.id})`);
    });

  } catch (e) {
    console.error(e);
  }
}

main();
