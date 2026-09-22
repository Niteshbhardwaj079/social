import { mockRequest } from '../mock/mockRequest';
import campaignsMockData from '../mock/campaignsMock';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let campaignsStore = [...campaignsMockData];

export function getCampaigns() {
  if (API_ENABLED) return axiosClient.get('/campaigns').then((response) => response.data.campaigns);
  return mockRequest([...campaignsStore]);
}

export function getCampaignById(campaignId) {
  if (API_ENABLED) return axiosClient.get(`/campaigns/${campaignId}`).then((response) => response.data.campaign);
  return mockRequest(campaignsStore.find((campaign) => campaign.id === campaignId) || null);
}

export function createCampaign(campaignPayload) {
  if (API_ENABLED) return axiosClient.post('/campaigns', campaignPayload).then((response) => response.data.campaign);
  const newCampaign = {
    id: `camp-${Date.now()}`,
    postsCount: 0,
    publishedCount: 0,
    scheduledCount: 0,
    failedCount: 0,
    engagement: 0,
    reach: 0,
    clicks: 0,
    ...campaignPayload,
  };
  campaignsStore = [newCampaign, ...campaignsStore];
  return mockRequest(newCampaign);
}

export function updateCampaign(campaignId, updates) {
  if (API_ENABLED) return axiosClient.patch(`/campaigns/${campaignId}`, updates).then((response) => response.data.campaign);
  campaignsStore = campaignsStore.map((campaign) =>
    campaign.id === campaignId ? { ...campaign, ...updates } : campaign
  );
  return mockRequest(campaignsStore.find((campaign) => campaign.id === campaignId));
}

export function deleteCampaign(campaignId) {
  if (API_ENABLED) return axiosClient.delete(`/campaigns/${campaignId}`).then(() => ({ success: true }));
  campaignsStore = campaignsStore.filter((campaign) => campaign.id !== campaignId);
  return mockRequest({ success: true });
}
