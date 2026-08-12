import { activeCampaigns, enqueueDueCampaignItem } from '../db/campaigns.js';
import { campaignDueToday, localDateAndTime } from './policy.js';
import { logger } from '../logger.js';

export async function processDueCampaigns(now = new Date()) {
  const campaigns = await activeCampaigns();
  let queued = 0;
  for (const campaign of campaigns) {
    if (!campaignDueToday(campaign, now)) continue;
    const { date } = localDateAndTime(now, campaign.timezone);
    try {
      const result = await enqueueDueCampaignItem({ campaign, localDate: date, scheduledAt: now });
      if (result) queued++;
    } catch (error) {
      logger.error({ error, campaignId: campaign.id }, 'failed queuing due campaign item');
    }
  }
  return queued;
}
