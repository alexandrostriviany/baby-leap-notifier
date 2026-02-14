const TelegramBot = require('node-telegram-bot-api');
const leapsData = require('../data/leaps.json');

// Configuration from environment
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BABY_BIRTH_DATE = process.env.BABY_BIRTH_DATE; // Format: YYYY-MM-DD
const TEST_MODE = process.env.TEST_MODE === 'true'; // For testing branch

if (!BOT_TOKEN || !CHAT_ID || !BABY_BIRTH_DATE) {
  console.error('Missing required environment variables:');
  console.error('- TELEGRAM_BOT_TOKEN');
  console.error('- TELEGRAM_CHAT_ID');
  console.error('- BABY_BIRTH_DATE (YYYY-MM-DD)');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

function getBabyAgeInWeeks(birthDate) {
  const birth = new Date(birthDate);
  const now = new Date();
  const diffMs = now - birth;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

function getBabyAgeInDays(birthDate) {
  const birth = new Date(birthDate);
  const now = new Date();
  const diffMs = now - birth;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getLeapStatus(birthDate, leap) {
  const ageInDays = getBabyAgeInDays(birthDate);
  const leapStartDay = leap.minWeeks * 7;
  const leapEndDay = leap.maxWeeks * 7 + 6;

  const daysUntilStart = leapStartDay - ageInDays;
  const daysUntilEnd = leapEndDay - ageInDays;

  return {
    daysUntilStart,
    daysUntilEnd,
    isUpcoming: daysUntilStart > 0 && daysUntilStart <= 3,
    isStartingToday: daysUntilStart === 0,
    isActive: daysUntilStart <= 0 && daysUntilEnd >= 0,
    isEndingToday: daysUntilEnd === 0,
    hasEnded: daysUntilEnd < 0
  };
}

function getCurrentOrNextLeap(birthDate) {
  const ageDays = getBabyAgeInDays(birthDate);

  for (const leap of leapsData.leaps) {
    const leapStartDay = leap.minWeeks * 7;
    const leapEndDay = leap.maxWeeks * 7 + 6;

    // Currently in this leap
    if (ageDays >= leapStartDay && ageDays <= leapEndDay) {
      return { leap, status: 'active', daysLeft: leapEndDay - ageDays };
    }

    // This leap is next
    if (ageDays < leapStartDay) {
      return { leap, status: 'upcoming', daysUntil: leapStartDay - ageDays };
    }
  }

  return null;
}

function formatLeapMessage(leap, messageType, birthDate) {
  let emoji, header;

  switch (messageType) {
    case 'upcoming':
      emoji = '🔔';
      header = `UPCOMING IN 3 DAYS`;
      break;
    case 'starting':
      emoji = '🚀';
      header = `STARTING TODAY`;
      break;
    case 'ending':
      emoji = '🎉';
      header = `ENDING TODAY`;
      break;
    case 'test':
      emoji = '🧪';
      header = `TEST MESSAGE`;
      break;
    default:
      emoji = '👶';
      header = 'LEAP INFO';
  }

  let message = `${emoji} *${header}*\n\n`;
  message += `*${leap.title}*\n`;
  message += `_(Weeks ${leap.minWeeks}-${leap.maxWeeks})_\n\n`;

  // Add start and end dates for upcoming leaps
  if (messageType === 'upcoming' && birthDate) {
    const birth = new Date(birthDate);
    const startDate = new Date(birth);
    startDate.setDate(birth.getDate() + leap.minWeeks * 7);
    const endDate = new Date(birth);
    endDate.setDate(birth.getDate() + leap.maxWeeks * 7 + 6);

    const formatDate = (date) => date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    // Format date for Google Calendar (YYYYMMDD)
    const formatGoogleDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };

    const calendarTitle = encodeURIComponent(leap.title);
    const calendarDetails = encodeURIComponent(`Baby developmental leap. ${leap.description.substring(0, 200)}...`);
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calendarTitle}&dates=${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}&details=${calendarDetails}`;

    message += `📅 *Dates:*\n`;
    message += `• Start: ${formatDate(startDate)}\n`;
    message += `• End: ${formatDate(endDate)}\n\n`;
    message += `[📆 Add to Google Calendar](${googleCalendarUrl})\n\n`;
  }

  message += `📖 *About this leap:*\n${leap.description}\n\n`;

  if (messageType !== 'ending') {
    message += `⚠️ *What to expect:*\n`;
    leap.whatToExpect.forEach(item => {
      message += `• ${item}\n`;
    });
    message += `\n`;
  }

  message += `✨ *New skills developing:*\n`;
  leap.newSkills.forEach(skill => {
    message += `• ${skill}\n`;
  });

  if (messageType === 'ending') {
    message += `\n🎊 Congratulations! Your baby has completed this developmental leap!`;
  } else if (messageType === 'upcoming') {
    message += `\n💪 Stay strong! This phase is temporary and helps your baby grow.`;
  }

  return message;
}

function formatTestMessage(birthDate) {
  const ageWeeks = getBabyAgeInWeeks(birthDate);
  const ageDays = getBabyAgeInDays(birthDate);
  const leapInfo = getCurrentOrNextLeap(birthDate);

  let message = `🧪 *TEST - Baby Leap Notifier*\n\n`;
  message += `📅 *Current Status:*\n`;
  message += `• Baby age: ${ageWeeks} weeks (${ageDays} days)\n`;
  message += `• Time: ${new Date().toISOString()}\n\n`;

  if (leapInfo) {
    if (leapInfo.status === 'active') {
      message += `🔄 *Currently in:* ${leapInfo.leap.title}\n`;
      message += `• ${leapInfo.daysLeft} days until this leap ends\n\n`;
    } else {
      message += `⏳ *Next leap:* ${leapInfo.leap.title}\n`;
      message += `• Starts in ${leapInfo.daysUntil} days\n\n`;
    }

    message += `📖 *Preview:*\n${leapInfo.leap.description.substring(0, 200)}...\n`;
  } else {
    message += `✅ All 8 leaps completed! Baby is now a toddler.\n`;
  }

  return message;
}

async function sendNotification(message) {
  try {
    await bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
    console.log('Notification sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send notification:', error.message);
    return false;
  }
}

async function checkAndNotify() {
  console.log('=== Baby Leap Notifier ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Baby birth date: ${BABY_BIRTH_DATE}`);
  console.log(`Test mode: ${TEST_MODE}`);

  const ageWeeks = getBabyAgeInWeeks(BABY_BIRTH_DATE);
  const ageDays = getBabyAgeInDays(BABY_BIRTH_DATE);

  console.log(`Baby age: ${ageWeeks} weeks (${ageDays} days)`);

  // TEST MODE: Always send a status message
  if (TEST_MODE) {
    console.log('Test mode enabled - sending test message');
    const testMessage = formatTestMessage(BABY_BIRTH_DATE);
    await sendNotification(testMessage);
    return;
  }

  // PRODUCTION MODE: Only send on leap events
  let notificationsSent = 0;

  for (const leap of leapsData.leaps) {
    const status = getLeapStatus(BABY_BIRTH_DATE, leap);

    if (status.isUpcoming) {
      console.log(`Leap ${leap.id} is upcoming in ${status.daysUntilStart} days`);
      const message = formatLeapMessage(leap, 'upcoming', BABY_BIRTH_DATE);
      if (await sendNotification(message)) notificationsSent++;
    }

    if (status.isStartingToday) {
      console.log(`Leap ${leap.id} is starting today!`);
      const message = formatLeapMessage(leap, 'starting', BABY_BIRTH_DATE);
      if (await sendNotification(message)) notificationsSent++;
    }

    if (status.isEndingToday) {
      console.log(`Leap ${leap.id} is ending today!`);
      const message = formatLeapMessage(leap, 'ending', BABY_BIRTH_DATE);
      if (await sendNotification(message)) notificationsSent++;
    }
  }

  if (notificationsSent === 0) {
    console.log('No leap events today');
  } else {
    console.log(`Sent ${notificationsSent} notification(s)`);
  }
}

checkAndNotify();
