
import { services } from '@maiyuri/api';

async function main() {
  console.log('Testing Task Creation...');
  
  const result = await services.tasks.createTask({
    title: 'Test Task from Script ' + Date.now(),
    description: 'This is a test task',
    priority: 'medium',
    dueDate: new Date().toISOString()
  });

  console.log('Result:', JSON.stringify(result, null, 2));

  if (!result.success) {
      console.error('FAILED. Error details:', result.error);
  } else {
      console.log('SUCCESS. Task ID:', result.data.id);
  }
}

main();
