import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

async function getChatId() {
  console.log('🔍 Getting your chat ID...\n');
  
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error('❌ BOT_TOKEN not set. Add BOT_TOKEN to your .env and try again.');
    return;
  }
  
  try {
    // Get updates from the bot
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const data = await response.json();
    
    if (data.ok && data.result.length > 0) {
      console.log('📱 Recent messages from users:');
      data.result.forEach((update, index) => {
        if (update.message) {
          const chat = update.message.chat;
          console.log(`\n${index + 1}. Chat ID: ${chat.id}`);
          console.log(`   Name: ${chat.first_name || ''} ${chat.last_name || ''}`);
          console.log(`   Username: @${chat.username || 'N/A'}`);
          console.log(`   Message: ${update.message.text || 'N/A'}`);
          console.log(`   Time: ${new Date(update.message.date * 1000).toLocaleString()}`);
        }
      });
      
      console.log('\n🎯 Next: copy your Chat ID above and set it as needed in your env.');
      
    } else {
      console.log('📭 No recent messages found.');
      console.log('\n💡 To get your chat ID:');
      console.log('   1. Open Telegram and search for your bot');
      console.log('   2. Click Start, then send any message');
      console.log('   3. Run this script again to see your chat ID');
    }
  } catch (error) {
    console.error('❌ Error getting updates:', error);
  }
}

getChatId();
